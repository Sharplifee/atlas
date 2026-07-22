import { describe, it, expect } from "vitest";
import {
  evaluateRules,
  type EntityWindow,
  type EvalContext,
  type Targets,
} from "@/lib/rules/engine";
import { RULE_DEFS, ALL_RULE_KEYS } from "@/lib/rules/defaults";
import type { RuleKey } from "@/lib/types";

const NOW = new Date("2026-07-22T12:00:00Z");
const FRESH = new Date("2026-07-22T11:40:00Z").toISOString(); // 20 min old
const STALE = new Date("2026-07-22T09:00:00Z").toISOString(); // 3 h old

function makeEntity(over: Partial<EntityWindow> = {}): EntityWindow {
  return {
    external_id: "ad_1",
    campaign_external_id: "camp_1",
    level: "ad",
    latest_pulled_at: FRESH,
    frequency: 1.5,
    ctr: 0.02,
    signal_quality: null,
    spend72h: 0,
    leads72h: 0,
    cpl72h: null,
    spend7d: 0,
    closed7d: 0,
    cpo7d: null,
    outcomeDays: 0,
    ctrSeries: [],
    signalSeries: [],
    peakCtr7d: 0,
    closeRate: null,
    dailyCap: null,
    ...over,
  };
}

function rulesMap(armed: boolean, paramOverrides: Partial<Record<RuleKey, Record<string, number>>> = {}) {
  const m = new Map<RuleKey, { enabled: boolean; armed: boolean; params: Record<string, number> }>();
  for (const k of ALL_RULE_KEYS) {
    m.set(k, { enabled: true, armed, params: { ...RULE_DEFS[k].defaults, ...(paramOverrides[k] ?? {}) } });
  }
  return m;
}

function ctx(over: Partial<EvalContext>): EvalContext {
  return {
    entities: [],
    targetsByCampaign: new Map<string, Targets>([
      ["camp_1", { target_cost_per_lead: 10, target_cost_per_outcome: 100, daily_cap: 100 }],
    ]),
    rules: rulesMap(false),
    shadowMode: true,
    coverage: null,
    accountCloseRateMedian: 0.1,
    now: NOW,
    ...over,
  };
}

describe("kill_cpl", () => {
  const entity = makeEntity({ cpl72h: 25, spend72h: 200, leads72h: 8 });

  it("shadow mode → shadow_pause, not executed", () => {
    const events = evaluateRules(ctx({ entities: [entity], shadowMode: true, rules: rulesMap(false) }));
    const e = events.find((x) => x.rule_key === "kill_cpl");
    expect(e).toBeTruthy();
    expect(e!.action).toBe("shadow_pause");
    expect(e!.executed).toBe(false);
  });

  it("armed + fresh → pause, executed", () => {
    const events = evaluateRules(ctx({ entities: [entity], shadowMode: false, rules: rulesMap(true) }));
    const e = events.find((x) => x.rule_key === "kill_cpl")!;
    expect(e.action).toBe("pause");
    expect(e.executed).toBe(true);
  });

  it("staleness guard blocks execution even when armed", () => {
    const stale = makeEntity({ cpl72h: 25, spend72h: 200, leads72h: 8, latest_pulled_at: STALE });
    const events = evaluateRules(ctx({ entities: [stale], shadowMode: false, rules: rulesMap(true) }));
    const e = events.find((x) => x.rule_key === "kill_cpl")!;
    expect(e.executed).toBe(false);
    expect(e.action).toBe("shadow_pause");
  });
});

describe("kill_zero", () => {
  it("fires on spend with zero leads", () => {
    const entity = makeEntity({ spend72h: 40, leads72h: 0 }); // 40 >= 3*10
    const events = evaluateRules(ctx({ entities: [entity] }));
    expect(events.some((e) => e.rule_key === "kill_zero")).toBe(true);
  });
  it("does not fire when there are leads", () => {
    const entity = makeEntity({ spend72h: 40, leads72h: 2, cpl72h: 20 });
    const events = evaluateRules(ctx({ entities: [entity] }));
    expect(events.some((e) => e.rule_key === "kill_zero")).toBe(false);
  });
});

describe("kill_cpo coverage suspension", () => {
  const entity = makeEntity({ cpo7d: 400, outcomeDays: 3 }); // 400 > 3*100
  it("fires when coverage is healthy", () => {
    const events = evaluateRules(ctx({ entities: [entity], coverage: 0.8 }));
    expect(events.some((e) => e.rule_key === "kill_cpo")).toBe(true);
  });
  it("auto-suspends when coverage is below the floor", () => {
    const events = evaluateRules(ctx({ entities: [entity], coverage: 0.3 }));
    expect(events.some((e) => e.rule_key === "kill_cpo")).toBe(false);
  });
});

describe("scaling and the scale gate", () => {
  const healthy = makeEntity({ cpl72h: 8, leads72h: 10, closeRate: 0.25, dailyCap: 100 });

  it("small step scales (within the auto rail)", () => {
    const events = evaluateRules(ctx({ entities: [healthy], rules: rulesMap(false) }));
    const e = events.find((x) => x.rule_key === "scale_step");
    expect(e).toBeTruthy();
    expect((e!.detail as any).after.daily_cap).toBe(120);
  });

  it("a step beyond the gate needs approval and never auto-executes", () => {
    const rules = rulesMap(true, { scale_step: { step_pct: 0.5, max_step_hours: 72 } });
    const events = evaluateRules(ctx({ entities: [healthy], shadowMode: false, rules }));
    const gate = events.find((x) => x.rule_key === "scale_gate")!;
    expect(gate.needs_approval).toBe(true);
    expect(gate.executed).toBe(false);
  });
});

describe("invariant: every triggered rule writes an event", () => {
  it("produces at least one event for a killable entity", () => {
    const entity = makeEntity({ cpl72h: 25, spend72h: 200, leads72h: 8 });
    const events = evaluateRules(ctx({ entities: [entity] }));
    expect(events.length).toBeGreaterThan(0);
  });
});
