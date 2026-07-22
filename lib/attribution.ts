import type { MatchedBy } from "@/lib/types";

/**
 * Attribution resolution ladder. Pure — unit tested in tests/attribution.test.ts.
 *
 * Priority order (spec §5):
 *   1. click_id  → exact ad (a click captured on the landing page)
 *   2. utm.content / utm.campaign → known ad / campaign external id
 *   3. contact_hash → inherit attribution from an earlier lead-stage outcome
 *   4. otherwise UNMATCHED — excluded from cost-per-outcome math, never guessed
 *
 * Manual entries with an explicit campaign/ad are marked `manual`.
 */

export interface AttributionInput {
  click_id?: string | null;
  utm?: Record<string, string> | null;
  campaign_external_id?: string | null;
  ad_external_id?: string | null;
  contact_hash?: string | null;
  /** true when the outcome came from manual entry with an explicit target */
  manual?: boolean;
}

export interface AttributionContext {
  knownAdIds: Set<string>;
  knownCampaignIds: Set<string>;
  /** contact_hash → attribution inherited from a prior click-based outcome */
  priorByContact: Map<
    string,
    { campaign_external_id: string | null; ad_external_id: string | null }
  >;
}

export interface AttributionResult {
  matched_by: MatchedBy;
  campaign_external_id: string | null;
  ad_external_id: string | null;
}

const EMPTY_CTX: AttributionContext = {
  knownAdIds: new Set(),
  knownCampaignIds: new Set(),
  priorByContact: new Map(),
};

export function resolveAttribution(
  input: AttributionInput,
  ctx: AttributionContext = EMPTY_CTX
): AttributionResult {
  const adKnown = (id?: string | null) => !!id && ctx.knownAdIds.has(id);
  const campKnown = (id?: string | null) =>
    !!id && ctx.knownCampaignIds.has(id);

  // 1. click_id — the strongest signal. Requires the outcome to carry a
  //    resolved ad or campaign target alongside the click id.
  if (input.click_id) {
    if (input.ad_external_id) {
      return {
        matched_by: "click_id",
        ad_external_id: input.ad_external_id,
        campaign_external_id: input.campaign_external_id ?? null,
      };
    }
    if (input.campaign_external_id) {
      return {
        matched_by: "click_id",
        ad_external_id: null,
        campaign_external_id: input.campaign_external_id,
      };
    }
  }

  // 2. utm mapping to a KNOWN ad/campaign id.
  const utmContent = input.utm?.content ?? input.utm?.utm_content;
  const utmCampaign = input.utm?.campaign ?? input.utm?.utm_campaign;
  if (adKnown(utmContent)) {
    return {
      matched_by: "utm",
      ad_external_id: utmContent!,
      campaign_external_id: input.campaign_external_id ?? null,
    };
  }
  if (campKnown(utmCampaign)) {
    return {
      matched_by: "utm",
      ad_external_id: null,
      campaign_external_id: utmCampaign!,
    };
  }
  // utm may also carry the campaign external id directly on the outcome
  if (campKnown(input.campaign_external_id) && (utmContent || utmCampaign)) {
    return {
      matched_by: "utm",
      ad_external_id: adKnown(input.ad_external_id) ? input.ad_external_id! : null,
      campaign_external_id: input.campaign_external_id!,
    };
  }

  // 3. contact_hash inheritance from an earlier click-based lead.
  if (input.contact_hash && ctx.priorByContact.has(input.contact_hash)) {
    const prior = ctx.priorByContact.get(input.contact_hash)!;
    if (prior.ad_external_id || prior.campaign_external_id) {
      return {
        matched_by: "click_id",
        ad_external_id: prior.ad_external_id,
        campaign_external_id: prior.campaign_external_id,
      };
    }
  }

  // Manual entry with an explicit, human-provided target.
  if (input.manual && (input.ad_external_id || input.campaign_external_id)) {
    return {
      matched_by: "manual",
      ad_external_id: input.ad_external_id ?? null,
      campaign_external_id: input.campaign_external_id ?? null,
    };
  }

  // 4. Unmatched. Honest by default.
  return {
    matched_by: "unmatched",
    ad_external_id: null,
    campaign_external_id: null,
  };
}
