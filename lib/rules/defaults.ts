import type { RuleKey } from "@/lib/types";

export interface RuleDef {
  key: RuleKey;
  title: string;
  /** Plain-English rendering used verbatim in the /rules UI. */
  describe: (p: Record<string, number>) => string;
  defaults: Record<string, number>;
  action: string;
}

export const RULE_DEFS: Record<RuleKey, RuleDef> = {
  kill_cpl: {
    key: "kill_cpl",
    title: "Kill on cost-per-lead blowout",
    defaults: { cpl_multiple: 2, spend_multiple: 1.5, window_hours: 72 },
    action: "Pause the ad",
    describe: (p) =>
      `Over ${p.window_hours}h, if cost-per-lead exceeds ${p.cpl_multiple}× target AND spend is at least ${p.spend_multiple}× the target cost-per-lead, pause the ad.`,
  },
  kill_zero: {
    key: "kill_zero",
    title: "Kill on zero leads",
    defaults: { spend_multiple: 3, window_hours: 72 },
    action: "Pause the ad",
    describe: (p) =>
      `If spend reaches ${p.spend_multiple}× the target cost-per-lead with zero attributed leads, pause the ad.`,
  },
  kill_cpo: {
    key: "kill_cpo",
    title: "Kill on cost-per-outcome",
    defaults: { cpo_multiple: 3, min_outcome_days: 2, window_days: 7 },
    action: "Pause the ad set",
    describe: (p) =>
      `Over ${p.window_days}d, if cost-per-closed-outcome exceeds ${p.cpo_multiple}× target and at least ${p.min_outcome_days} outcome-window days have elapsed, pause the ad set. Auto-suspends when attribution coverage is low.`,
  },
  fatigue: {
    key: "fatigue",
    title: "Creative fatigue",
    defaults: { frequency_max: 3.5, ctr_pct_of_peak: 0.7 },
    action: "Pause ad + request a creative slot",
    describe: (p) =>
      `If frequency exceeds ${p.frequency_max} and CTR falls to ${Math.round(
        p.ctr_pct_of_peak * 100
      )}% of its own 7-day peak, pause the ad and request a fresh creative.`,
  },
  scale_step: {
    key: "scale_step",
    title: "Step scaling",
    defaults: { step_pct: 0.2, max_step_hours: 72 },
    action: "Increase budget one step",
    describe: (p) =>
      `When cost-per-lead is at/under target with a healthy close-rate and stable delivery, raise budget by ${Math.round(
        p.step_pct * 100
      )}% — at most one step per ad set per ${p.max_step_hours}h.`,
  },
  scale_gate: {
    key: "scale_gate",
    title: "Scale gate (human approval)",
    defaults: { max_auto_pct: 0.2 },
    action: "Queue for approval",
    describe: (p) =>
      `Any proposed change above +${Math.round(
        p.max_auto_pct * 100
      )}%/day, or that pushes account spend beyond the sum of daily caps, is queued for a human — never automatic.`,
  },
  drift_ctr: {
    key: "drift_ctr",
    title: "CTR / qualify-rate drift",
    defaults: { slope_days: 3 },
    action: "Flag for the agent",
    describe: (p) =>
      `A ${p.slope_days}-day negative slope on CTR or qualify-rate with stable spend is flagged for Atlas to investigate.`,
  },
  drift_signal: {
    key: "drift_signal",
    title: "Signal-quality drift",
    defaults: { drop_threshold: 1.0 },
    action: "Flag: data health",
    describe: (p) =>
      `A signal-quality (EMQ) drop of ${p.drop_threshold} or more versus the last reading is flagged as a data-health issue.`,
  },
};

export const ALL_RULE_KEYS: RuleKey[] = Object.keys(RULE_DEFS) as RuleKey[];
