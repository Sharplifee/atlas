import { createServiceClient } from "@/lib/supabase/service";
import { MetaClient, rollupToCampaign, type InsightRow } from "@/lib/platforms/meta";
import { deriveMetrics } from "@/lib/metrics";
import { decrypt } from "@/lib/crypto";
import { runRuleEngine } from "@/lib/rules/engine";
import { env } from "@/lib/env";

interface OutcomeAgg {
  leads: number;
  qualified: number;
  closed: number;
  revenue: number;
}

function emptyAgg(): OutcomeAgg {
  return { leads: 0, qualified: 0, closed: 0, revenue: 0 };
}

function bump(agg: OutcomeAgg, stage: string, value: number) {
  // stage ordering: a closed outcome was also a lead and qualified
  if (["lead", "qualified", "closed"].includes(stage)) agg.leads += 1;
  if (["qualified", "closed"].includes(stage)) agg.qualified += 1;
  if (stage === "closed") {
    agg.closed += 1;
    agg.revenue += value;
  }
}

export interface PullResult {
  accounts: number;
  snapshots: number;
  workspaces: number;
  errors: { account?: string; workspace?: string; message: string }[];
}

/**
 * Pull metrics for every active ad account (or a single workspace), join
 * attributed outcomes, compute outcome-truth metrics, write snapshots, then run
 * the rule engine in-process per workspace.
 */
export async function runMetricsPull(opts?: {
  workspaceId?: string;
}): Promise<PullResult> {
  const db = createServiceClient();
  const result: PullResult = { accounts: 0, snapshots: 0, workspaces: 0, errors: [] };

  let q = db.from("ad_accounts").select("*").eq("status", "active");
  if (opts?.workspaceId) q = q.eq("workspace_id", opts.workspaceId);
  const { data: accounts, error } = await q;
  if (error) {
    result.errors.push({ message: `load accounts: ${error.message}` });
    return result;
  }

  const byWorkspace = new Map<string, any[]>();
  for (const a of accounts ?? []) {
    const arr = byWorkspace.get(a.workspace_id) ?? [];
    arr.push(a);
    byWorkspace.set(a.workspace_id, arr);
  }

  for (const [workspaceId, wsAccounts] of byWorkspace) {
    result.workspaces += 1;

    // Attributed outcomes for this workspace (last 30 days), pre-aggregated.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: outcomes } = await db
      .from("outcomes")
      .select("stage, value, campaign_external_id, ad_external_id, matched_by")
      .eq("workspace_id", workspaceId)
      .gte("occurred_at", since);

    const byAd = new Map<string, OutcomeAgg>();
    const byCampaign = new Map<string, OutcomeAgg>();
    for (const o of outcomes ?? []) {
      if (o.matched_by === "unmatched") continue;
      const val = Number(o.value ?? 0);
      if (o.ad_external_id) {
        const a = byAd.get(o.ad_external_id) ?? emptyAgg();
        bump(a, o.stage, val);
        byAd.set(o.ad_external_id, a);
      }
      if (o.campaign_external_id) {
        const c = byCampaign.get(o.campaign_external_id) ?? emptyAgg();
        bump(c, o.stage, val);
        byCampaign.set(o.campaign_external_id, c);
      }
    }

    const pulledAt = new Date().toISOString();

    for (const account of wsAccounts) {
      result.accounts += 1;
      try {
        let token: string | undefined;
        const mode = env.metaMode();
        if (mode === "live" && account.access_token_encrypted) {
          token = decrypt(account.access_token_encrypted);
        }
        const client = new MetaClient({
          mode,
          accessToken: token,
          apiVersion: env.metaApiVersion(),
          accountExternalId: account.external_id,
        });

        const adRows = await client.getInsights("ad");
        const campRows = rollupToCampaign(adRows);

        // Discover campaigns (insert-if-new, never clobber targets).
        const campaignRows = campRows.map((c) => ({
          workspace_id: workspaceId,
          ad_account_id: account.id,
          external_id: c.campaign_external_id,
          name: c.campaign_external_id,
        }));
        if (campaignRows.length > 0) {
          await db
            .from("campaigns")
            .upsert(campaignRows, {
              onConflict: "ad_account_id,external_id",
              ignoreDuplicates: true,
            });
        }

        const snapRows: any[] = [];
        const toSnap = (r: InsightRow, agg: OutcomeAgg) => {
          const derived = deriveMetrics({
            spend: r.spend,
            attributed_leads: agg.leads,
            attributed_qualified: agg.qualified,
            attributed_closed: agg.closed,
            attributed_revenue: agg.revenue,
          });
          return {
            workspace_id: workspaceId,
            ad_account_id: account.id,
            pulled_at: pulledAt,
            level: r.level,
            external_id: r.external_id,
            campaign_external_id: r.campaign_external_id,
            spend: r.spend,
            impressions: r.impressions,
            reach: r.reach,
            frequency: r.frequency,
            ctr: r.ctr,
            cpc: r.cpc,
            cpm: r.cpm,
            link_clicks: r.link_clicks,
            platform_conversions: r.platform_conversions,
            attributed_leads: agg.leads,
            attributed_qualified: agg.qualified,
            attributed_closed: agg.closed,
            attributed_revenue: agg.revenue,
            cost_per_lead: derived.cost_per_lead,
            cost_per_outcome: derived.cost_per_outcome,
            roas: derived.roas,
            signal_quality: null,
            raw: r.raw,
          };
        };

        for (const r of adRows) snapRows.push(toSnap(r, byAd.get(r.external_id) ?? emptyAgg()));
        for (const r of campRows)
          snapRows.push(toSnap(r, byCampaign.get(r.campaign_external_id) ?? emptyAgg()));

        if (snapRows.length > 0) {
          const { error: insErr } = await db.from("metric_snapshots").insert(snapRows);
          if (insErr) throw new Error(insErr.message);
          result.snapshots += snapRows.length;
        }
      } catch (e: any) {
        // Failure policy: skip this account, log, do NOT write partial data.
        result.errors.push({
          account: account.external_id,
          workspace: workspaceId,
          message: e?.message ?? String(e),
        });
      }
    }

    // Rule engine runs in-process after snapshots land.
    try {
      const summary = await runRuleEngine(db, workspaceId);
      await db.from("agent_runs").insert({
        workspace_id: workspaceId,
        kind: "pull:metrics",
        ok: true,
        finished_at: new Date().toISOString(),
        inputs: { rule_summary: summary },
      });
    } catch (e: any) {
      result.errors.push({ workspace: workspaceId, message: `rules: ${e?.message}` });
    }
  }

  return result;
}
