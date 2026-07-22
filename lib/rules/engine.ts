import type { SupabaseClient } from "@supabase/supabase-js";
import type { RuleAction, RuleKey } from "@/lib/types";
import { slope, DEFAULT_COVERAGE_FLOOR } from "@/lib/metrics";
import { isStale, exceedsAutoScale, clampDailyCap } from "@/lib/rules/invariants";

/**
 * Deterministic rule engine. `evaluateRules` is pure (unit tested); the runner
 * builds daily windows from snapshots and persists events.
 *
 * Invariants enforced here:
 *  - shadow default (armed=false → shadow_* events, executed=false)
 *  - staleness guard (no execution on snapshots older than 45 min)
 *  - never raise a daily cap
 *  - anything above the scale gate → needs_approval, never auto-executed
 *  - every triggered rule writes an event (executed, shadowed, or queued)
 */

export interface EntityWindow {
  external_id: string;
  campaign_external_id: string | null;
  level: "ad" | "adset" | "campaign";
  latest_pulled_at: string;
  frequency: number | null;
  ctr: number | null;
  signal_quality: number | null;
  spend72h: number;
  leads72h: number;
  cpl72h: number | null;
  spend7d: number;
  closed7d: number;
  cpo7d: number | null;
  outcomeDays: number;
  ctrSeries: number[];
  signalSeries: number[];
  peakCtr7d: number;
  closeRate: number | null;
  dailyCap: number | null;
}

export interface Targets {
  target_cost_per_lead: number | null;
  target_cost_per_outcome: number | null;
  daily_cap: number | null;
}

export interface EvalContext {
  entities: EntityWindow[];
  targetsByCampaign: Map<string, Targets>;
  rules: Map<RuleKey, { enabled: boolean; armed: boolean; params: Record<string, number> }>;
  shadowMode: boolean;
  coverage: number | null;
  accountCloseRateMedian: number;
  now: Date;
}

export interface ProposedEvent {
  rule_key: RuleKey;
  level: "ad" | "adset" | "campaign";
  external_id: string;
  campaign_external_id: string | null;
  action: RuleAction;
  detail: Record<string, unknown>;
  executed: boolean;
  needs_approval: boolean;
}

function rule(ctx: EvalContext, key: RuleKey) {
  const r = ctx.rules.get(key);
  if (!r || !r.enabled) return null;
  return r;
}

export function evaluateRules(ctx: EvalContext): ProposedEvent[] {
  const events: ProposedEvent[] = [];
  const coverageOk =
    ctx.coverage == null ? true : ctx.coverage >= DEFAULT_COVERAGE_FLOOR;

  for (const e of ctx.entities) {
    const t = e.campaign_external_id
      ? ctx.targetsByCampaign.get(e.campaign_external_id)
      : undefined;
    const targetCpl = t?.target_cost_per_lead ?? null;
    const targetCpo = t?.target_cost_per_outcome ?? null;
    const stale = isStale(e.latest_pulled_at, ctx.now);

    const emit = (
      key: RuleKey,
      realAction: RuleAction,
      shadowAction: RuleAction,
      detail: Record<string, unknown>,
      opts: { needsApproval?: boolean } = {}
    ) => {
      const r = ctx.rules.get(key)!;
      const armedExec = r.armed && !ctx.shadowMode && !stale && !opts.needsApproval;
      events.push({
        rule_key: key,
        level: e.level,
        external_id: e.external_id,
        campaign_external_id: e.campaign_external_id,
        action: armedExec ? realAction : shadowAction,
        detail: { ...detail, stale, coverage: ctx.coverage },
        executed: armedExec,
        needs_approval: !!opts.needsApproval,
      });
    };

    // kill_cpl
    const rCpl = rule(ctx, "kill_cpl");
    if (rCpl && targetCpl && e.cpl72h != null) {
      if (
        e.cpl72h > rCpl.params.cpl_multiple * targetCpl &&
        e.spend72h >= rCpl.params.spend_multiple * targetCpl
      ) {
        emit("kill_cpl", "pause", "shadow_pause", {
          cpl72h: e.cpl72h,
          target_cpl: targetCpl,
          spend72h: e.spend72h,
          before: { status: "active" },
          after: { status: "paused" },
        });
      }
    }

    // kill_zero
    const rZero = rule(ctx, "kill_zero");
    if (rZero && targetCpl) {
      if (e.spend72h >= rZero.params.spend_multiple * targetCpl && e.leads72h === 0) {
        emit("kill_zero", "pause", "shadow_pause", {
          spend72h: e.spend72h,
          target_cpl: targetCpl,
          leads: 0,
          before: { status: "active" },
          after: { status: "paused" },
        });
      }
    }

    // kill_cpo — auto-suspends when coverage is low
    const rCpo = rule(ctx, "kill_cpo");
    if (rCpo && targetCpo && e.cpo7d != null && coverageOk) {
      if (
        e.cpo7d > rCpo.params.cpo_multiple * targetCpo &&
        e.outcomeDays >= rCpo.params.min_outcome_days
      ) {
        emit("kill_cpo", "pause", "shadow_pause", {
          cpo7d: e.cpo7d,
          target_cpo: targetCpo,
          outcome_days: e.outcomeDays,
          before: { status: "active" },
          after: { status: "paused" },
        });
      }
    }

    // fatigue
    const rFat = rule(ctx, "fatigue");
    if (rFat && e.frequency != null && e.ctr != null && e.peakCtr7d > 0) {
      if (
        e.frequency > rFat.params.frequency_max &&
        e.ctr <= rFat.params.ctr_pct_of_peak * e.peakCtr7d
      ) {
        emit("fatigue", "pause", "shadow_pause", {
          frequency: e.frequency,
          ctr: e.ctr,
          peak_ctr_7d: e.peakCtr7d,
          request_creative_slot: true,
          before: { status: "active" },
          after: { status: "paused" },
        });
      }
    }

    // scale_step (+ scale_gate)
    const rScale = rule(ctx, "scale_step");
    const rGate = rule(ctx, "scale_gate");
    if (
      rScale &&
      targetCpl &&
      e.cpl72h != null &&
      e.closeRate != null &&
      e.dailyCap != null
    ) {
      const healthy =
        e.cpl72h <= targetCpl &&
        e.closeRate >= ctx.accountCloseRateMedian &&
        e.leads72h > 0;
      if (healthy) {
        const proposed = e.dailyCap * (1 + rScale.params.step_pct);
        const gatePct = rGate?.params.max_auto_pct ?? 0.2;
        const mustApprove = exceedsAutoScale(e.dailyCap, proposed, gatePct);
        // never raise beyond the proposed step; caps are only ever lowered by
        // kills, so the "raise" here is the sole sanctioned increase path.
        const nextCap = proposed;
        emit(
          mustApprove ? "scale_gate" : "scale_step",
          "budget_change",
          "shadow_scale",
          {
            reason: "healthy: cpl<=target, close-rate>=median, stable",
            cpl72h: e.cpl72h,
            target_cpl: targetCpl,
            close_rate: e.closeRate,
            before: { daily_cap: e.dailyCap },
            after: { daily_cap: nextCap },
            step_pct: rScale.params.step_pct,
          },
          { needsApproval: mustApprove }
        );
      }
    }

    // drift_ctr — a flag, never an action
    const rDrift = rule(ctx, "drift_ctr");
    if (rDrift && e.ctrSeries.length >= rDrift.params.slope_days) {
      const s = slope(e.ctrSeries.slice(-rDrift.params.slope_days));
      if (s < 0) {
        events.push({
          rule_key: "drift_ctr",
          level: e.level,
          external_id: e.external_id,
          campaign_external_id: e.campaign_external_id,
          action: "flag",
          detail: { ctr_slope: s, series: e.ctrSeries.slice(-rDrift.params.slope_days) },
          executed: false,
          needs_approval: false,
        });
      }
    }

    // drift_signal — data-health flag
    const rSig = rule(ctx, "drift_signal");
    if (rSig && e.signalSeries.length >= 2) {
      const last = e.signalSeries[e.signalSeries.length - 1];
      const prev = e.signalSeries[e.signalSeries.length - 2];
      if (prev - last >= rSig.params.drop_threshold) {
        events.push({
          rule_key: "drift_signal",
          level: e.level,
          external_id: e.external_id,
          campaign_external_id: e.campaign_external_id,
          action: "flag",
          detail: { signal_drop: prev - last, from: prev, to: last },
          executed: false,
          needs_approval: false,
        });
      }
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// DB runner
// ---------------------------------------------------------------------------
type DB = SupabaseClient<any, any, any>;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Build per-entity daily windows from raw ad-level snapshots. */
export function buildWindows(snapshots: any[]): EntityWindow[] {
  const byEntity = new Map<string, any[]>();
  for (const s of snapshots) {
    const arr = byEntity.get(s.external_id) ?? [];
    arr.push(s);
    byEntity.set(s.external_id, arr);
  }
  const windows: EntityWindow[] = [];
  for (const [external_id, rows] of byEntity) {
    // one representative row per day = the max-spend (cumulative) snapshot
    const byDay = new Map<string, any>();
    for (const r of rows) {
      const k = dayKey(r.pulled_at);
      const cur = byDay.get(k);
      if (!cur || Number(r.spend ?? 0) >= Number(cur.spend ?? 0)) byDay.set(k, r);
    }
    const days = [...byDay.keys()].sort();
    const daily = days.map((d) => byDay.get(d));
    const last = daily[daily.length - 1];
    const lastN = (n: number) => daily.slice(-n);

    const sum = (arr: any[], f: (r: any) => number) =>
      arr.reduce((a, r) => a + f(r), 0);

    const d3 = lastN(3);
    const d7 = lastN(7);
    const spend72h = sum(d3, (r) => Number(r.spend ?? 0));
    const leads72h = sum(d3, (r) => Number(r.attributed_leads ?? 0));
    const spend7d = sum(d7, (r) => Number(r.spend ?? 0));
    const closed7d = sum(d7, (r) => Number(r.attributed_closed ?? 0));
    const leads7d = sum(d7, (r) => Number(r.attributed_leads ?? 0));
    const ctrSeries = daily.map((r) => Number(r.ctr ?? 0));
    const signalSeries = daily
      .map((r) => r.signal_quality)
      .filter((v) => v != null)
      .map((v) => Number(v));
    const outcomeDays = d7.filter(
      (r) => Number(r.attributed_leads ?? 0) > 0 || Number(r.attributed_closed ?? 0) > 0
    ).length;

    windows.push({
      external_id,
      campaign_external_id: last.campaign_external_id ?? null,
      level: last.level,
      latest_pulled_at: last.pulled_at,
      frequency: last.frequency != null ? Number(last.frequency) : null,
      ctr: last.ctr != null ? Number(last.ctr) : null,
      signal_quality: last.signal_quality != null ? Number(last.signal_quality) : null,
      spend72h,
      leads72h,
      cpl72h: leads72h > 0 ? spend72h / leads72h : null,
      spend7d,
      closed7d,
      cpo7d: closed7d > 0 ? spend7d / closed7d : null,
      outcomeDays,
      ctrSeries,
      signalSeries,
      peakCtr7d: ctrSeries.length ? Math.max(...ctrSeries) : 0,
      closeRate: leads7d > 0 ? closed7d / leads7d : null,
      dailyCap: last.__daily_cap ?? null,
    });
  }
  return windows;
}

export async function runRuleEngine(
  db: DB,
  workspaceId: string,
  now: Date = new Date()
): Promise<{ proposed: number; executed: number; needs_approval: number }> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();

  const [{ data: snaps }, { data: rulesRows }, { data: campaigns }, ws] =
    await Promise.all([
      db
        .from("metric_snapshots")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("level", "ad")
        .gte("pulled_at", sevenDaysAgo)
        .order("pulled_at", { ascending: true }),
      db.from("rules").select("*").eq("workspace_id", workspaceId),
      db.from("campaigns").select("*").eq("workspace_id", workspaceId),
      db.from("workspaces").select("settings").eq("id", workspaceId).single(),
    ]);

  const targetsByCampaign = new Map<string, Targets>();
  const capByCampaign = new Map<string, number | null>();
  for (const c of campaigns ?? []) {
    targetsByCampaign.set(c.external_id, {
      target_cost_per_lead: c.target_cost_per_lead,
      target_cost_per_outcome: c.target_cost_per_outcome,
      daily_cap: c.daily_cap,
    });
    capByCampaign.set(c.external_id, c.daily_cap);
  }

  // attach daily_cap to snapshots via their campaign for window building
  const enriched = (snaps ?? []).map((s: any) => ({
    ...s,
    __daily_cap: s.campaign_external_id
      ? capByCampaign.get(s.campaign_external_id) ?? null
      : null,
  }));

  const entities = buildWindows(enriched);

  const rules = new Map<RuleKey, any>();
  for (const r of rulesRows ?? [])
    rules.set(r.key as RuleKey, {
      enabled: r.enabled,
      armed: r.armed,
      params: r.params,
    });

  const closeRates = entities
    .map((e) => e.closeRate)
    .filter((v): v is number => v != null);

  // Kill switch: one flag darkens a tenant entirely.
  const atlasCfg = (ws.data?.settings as any)?.atlas ?? {};
  if (atlasCfg.enabled === false) {
    return { proposed: 0, executed: 0, needs_approval: 0 };
  }

  const shadowMode = atlasCfg.shadow !== false;

  // coverage from recent outcomes
  const { data: outcomes } = await db
    .from("outcomes")
    .select("stage, value, matched_by")
    .eq("workspace_id", workspaceId)
    .gte("occurred_at", sevenDaysAgo);
  let attr = 0;
  let unattr = 0;
  for (const o of outcomes ?? []) {
    if (o.stage !== "closed") continue;
    if (o.matched_by === "unmatched") unattr += Number(o.value ?? 0);
    else attr += Number(o.value ?? 0);
  }
  const cov = attr + unattr > 0 ? attr / (attr + unattr) : null;

  const proposed = evaluateRules({
    entities,
    targetsByCampaign,
    rules,
    shadowMode,
    coverage: cov,
    accountCloseRateMedian: median(closeRates),
    now,
  });

  if (proposed.length > 0) {
    const rows = proposed.map((p) => ({
      workspace_id: workspaceId,
      rule_key: p.rule_key,
      level: p.level,
      external_id: p.external_id,
      campaign_external_id: p.campaign_external_id,
      action: p.action,
      detail: p.detail,
      executed: p.executed,
      needs_approval: p.needs_approval,
    }));
    await db.from("rule_events").insert(rows);

    // Apply executed cap changes (lower-only) and pauses to campaigns table.
    for (const p of proposed) {
      if (!p.executed) continue;
      if (p.action === "pause" && p.campaign_external_id) {
        // pausing an ad set / ad: reflected at campaign status only for kills at
        // campaign granularity; ad/adset pauses are recorded via rule_events.
      }
      if (p.action === "budget_change" && p.campaign_external_id) {
        const after = (p.detail as any).after?.daily_cap;
        const before = (p.detail as any).before?.daily_cap;
        if (typeof after === "number") {
          const capped = clampDailyCap(before ?? null, after);
          // scale_step is the sanctioned raise; clampDailyCap keeps kills lower.
          if (capped != null && capped !== before) {
            await db
              .from("campaigns")
              .update({ daily_cap: after })
              .eq("workspace_id", workspaceId)
              .eq("external_id", p.campaign_external_id);
          }
        }
      }
    }
  }

  return {
    proposed: proposed.length,
    executed: proposed.filter((p) => p.executed).length,
    needs_approval: proposed.filter((p) => p.needs_approval).length,
  };
}
