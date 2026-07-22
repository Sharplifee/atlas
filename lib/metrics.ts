/**
 * Pure metric derivations. No I/O — unit tested in tests/metrics.test.ts.
 *
 * Atlas judges on OUTCOME TRUTH:
 *   cost_per_lead    = spend / attributed_leads
 *   cost_per_outcome = spend / attributed_closed   (the real target)
 *   roas             = attributed_revenue / spend
 *
 * A null is returned wherever the denominator is zero/absent — Atlas never
 * fabricates a number it cannot compute.
 */

export interface OutcomeCounts {
  spend: number;
  attributed_leads: number;
  attributed_qualified?: number;
  attributed_closed: number;
  attributed_revenue: number;
}

export interface DerivedMetrics {
  cost_per_lead: number | null;
  cost_per_outcome: number | null;
  roas: number | null;
}

export function deriveMetrics(c: OutcomeCounts): DerivedMetrics {
  const spend = c.spend ?? 0;
  return {
    cost_per_lead:
      c.attributed_leads > 0 ? round(spend / c.attributed_leads) : null,
    cost_per_outcome:
      c.attributed_closed > 0 ? round(spend / c.attributed_closed) : null,
    roas: spend > 0 ? round(c.attributed_revenue / spend, 4) : null,
  };
}

/**
 * Attribution coverage = share of revenue that Atlas could attribute to a
 * specific ad/campaign. Below the configured floor, outcome-based rules must
 * auto-suspend and the agent must state reduced confidence.
 */
export function coverage(
  attributedRevenue: number,
  unattributedRevenue: number
): number | null {
  const total = attributedRevenue + unattributedRevenue;
  if (total <= 0) return null;
  return round(attributedRevenue / total, 4);
}

export const DEFAULT_COVERAGE_FLOOR = 0.6;

export function round(v: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/** Least-squares slope over a series (used by drift rules). */
export function slope(series: number[]): number {
  const n = series.length;
  if (n < 2) return 0;
  const xs = series.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (series[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? 0 : round(num / den, 4);
}
