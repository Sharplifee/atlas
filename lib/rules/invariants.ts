/**
 * Hard-coded rule-engine invariants. These are NOT parameters — they cannot be
 * edited per workspace. Every automated action is subject to all of them.
 */

/** No action may fire on data older than this. */
export const STALENESS_MINUTES = 45;

/** Snapshot is too old to act on. */
export function isStale(pulledAt: string | Date, now: Date = new Date()): boolean {
  const t = new Date(pulledAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > STALENESS_MINUTES * 60_000;
}

/** A rule may lower a daily cap but NEVER raise it. */
export function clampDailyCap(
  currentCap: number | null,
  proposedCap: number
): number | null {
  if (currentCap == null) return proposedCap;
  return Math.min(currentCap, proposedCap);
}

/**
 * A budget increase is only permitted up to max_auto_pct/day. Anything larger
 * must route to the scale gate for human approval.
 */
export function exceedsAutoScale(
  currentBudget: number,
  proposedBudget: number,
  maxAutoPct: number
): boolean {
  if (currentBudget <= 0) return true;
  return (proposedBudget - currentBudget) / currentBudget > maxAutoPct + 1e-9;
}
