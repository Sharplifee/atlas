import { describe, it, expect } from "vitest";
import { resolveAttribution, type AttributionContext } from "@/lib/attribution";

function ctx(over: Partial<AttributionContext> = {}): AttributionContext {
  return {
    knownAdIds: new Set(["ad_1", "ad_2"]),
    knownCampaignIds: new Set(["camp_1"]),
    priorByContact: new Map(),
    ...over,
  };
}

describe("attribution ladder", () => {
  it("1. click_id + ad wins as click_id", () => {
    const r = resolveAttribution(
      { click_id: "fb.1.abc", ad_external_id: "ad_1", campaign_external_id: "camp_1" },
      ctx()
    );
    expect(r.matched_by).toBe("click_id");
    expect(r.ad_external_id).toBe("ad_1");
  });

  it("2. utm.content mapping to a known ad", () => {
    const r = resolveAttribution({ utm: { content: "ad_2" } }, ctx());
    expect(r.matched_by).toBe("utm");
    expect(r.ad_external_id).toBe("ad_2");
  });

  it("2b. utm.campaign mapping to a known campaign", () => {
    const r = resolveAttribution({ utm: { campaign: "camp_1" } }, ctx());
    expect(r.matched_by).toBe("utm");
    expect(r.campaign_external_id).toBe("camp_1");
  });

  it("3. contact_hash inherits prior click-based attribution", () => {
    const prior = new Map([
      ["sha256:x", { campaign_external_id: "camp_1", ad_external_id: "ad_1" }],
    ]);
    const r = resolveAttribution({ contact_hash: "sha256:x" }, ctx({ priorByContact: prior }));
    expect(r.matched_by).toBe("click_id");
    expect(r.ad_external_id).toBe("ad_1");
  });

  it("manual entry with explicit target", () => {
    const r = resolveAttribution(
      { manual: true, campaign_external_id: "camp_1" },
      ctx()
    );
    expect(r.matched_by).toBe("manual");
  });

  it("4. unmatched by default — never guesses", () => {
    const r = resolveAttribution({ utm: { content: "unknown_ad" } }, ctx());
    expect(r.matched_by).toBe("unmatched");
    expect(r.ad_external_id).toBeNull();
    expect(r.campaign_external_id).toBeNull();
  });

  it("unknown utm does not fabricate a campaign", () => {
    const r = resolveAttribution({ utm: { campaign: "not_a_real_campaign" } }, ctx());
    expect(r.matched_by).toBe("unmatched");
  });
});
