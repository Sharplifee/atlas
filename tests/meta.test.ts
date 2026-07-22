import { describe, it, expect } from "vitest";
import { MetaClient, rollupToCampaign } from "@/lib/platforms/meta";

describe("Meta fixture / replay mode", () => {
  it("replays fixtured account data verbatim", async () => {
    const c = new MetaClient({ mode: "fixture", accountExternalId: "act_demo" });
    const rows = await c.getInsights("ad");
    expect(rows.length).toBe(3);
    expect(rows[0].campaign_external_id).toBe("act_demo_camp_spring");
  });

  it("synthesizes deterministically for an unknown account (stable replay)", async () => {
    const a = await new MetaClient({ mode: "fixture", accountExternalId: "act_x99" }).getInsights("ad");
    const b = await new MetaClient({ mode: "fixture", accountExternalId: "act_x99" }).getInsights("ad");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("rolls ad rows up to campaign totals correctly", () => {
    const camp = rollupToCampaign([
      { level: "ad", external_id: "a1", campaign_external_id: "c1", spend: 100, impressions: 1000, reach: 800, frequency: 1.25, ctr: 0.02, cpc: 0.5, cpm: 100, link_clicks: 20, platform_conversions: 2, raw: {} },
      { level: "ad", external_id: "a2", campaign_external_id: "c1", spend: 50, impressions: 500, reach: 400, frequency: 1.25, ctr: 0.02, cpc: 0.5, cpm: 100, link_clicks: 10, platform_conversions: 1, raw: {} },
    ]);
    expect(camp).toHaveLength(1);
    expect(camp[0].spend).toBe(150);
    expect(camp[0].impressions).toBe(1500);
    expect(camp[0].link_clicks).toBe(30);
    expect(camp[0].level).toBe("campaign");
  });
});
