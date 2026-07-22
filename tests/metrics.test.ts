import { describe, it, expect } from "vitest";
import { deriveMetrics, coverage, slope } from "@/lib/metrics";

describe("deriveMetrics", () => {
  it("computes cost-per-lead and cost-per-outcome", () => {
    const d = deriveMetrics({
      spend: 300,
      attributed_leads: 30,
      attributed_closed: 3,
      attributed_revenue: 6000,
    });
    expect(d.cost_per_lead).toBe(10);
    expect(d.cost_per_outcome).toBe(100);
    expect(d.roas).toBe(20);
  });

  it("returns null where the denominator is zero — never fabricates", () => {
    const d = deriveMetrics({
      spend: 300,
      attributed_leads: 0,
      attributed_closed: 0,
      attributed_revenue: 0,
    });
    expect(d.cost_per_lead).toBeNull();
    expect(d.cost_per_outcome).toBeNull();
  });
});

describe("coverage", () => {
  it("is the attributed share of revenue", () => {
    expect(coverage(750, 250)).toBe(0.75);
  });
  it("is null with no revenue", () => {
    expect(coverage(0, 0)).toBeNull();
  });
});

describe("slope", () => {
  it("is positive for a rising series", () => {
    expect(slope([1, 2, 3, 4])).toBeGreaterThan(0);
  });
  it("is negative for a falling series", () => {
    expect(slope([4, 3, 2, 1])).toBeLessThan(0);
  });
});
