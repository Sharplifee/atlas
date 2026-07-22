import fixtures from "@/fixtures/meta.json";

/**
 * Meta Marketing API + Ad Library client.
 *
 * Two modes, chosen by META_MODE (or the `mode` arg):
 *   - "fixture" (default): replays local JSON, and deterministically SYNTHESIZES
 *     stable data for any account/page not in the fixture file. This makes the
 *     entire A2 pipeline testable with zero live credentials.
 *   - "live": calls the Graph API with retry/backoff. Never exercised unless a
 *     real System User token is connected.
 */

export type Level = "campaign" | "adset" | "ad";

export interface InsightRow {
  level: Level;
  external_id: string;
  campaign_external_id: string;
  adset_external_id?: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  link_clicks: number;
  platform_conversions: number;
  raw: unknown;
}

export interface AdLibraryRow {
  archive_id: string;
  page_id: string;
  page_name?: string;
  started_running?: string;
  first_seen?: string;
  last_seen?: string;
  format?: string;
  body?: string;
  headline?: string;
  cta?: string;
  platforms?: string[];
  raw?: unknown;
}

export interface MetaClientOptions {
  mode?: "fixture" | "live";
  accessToken?: string;
  apiVersion?: string;
  accountExternalId: string;
}

const GRAPH = "https://graph.facebook.com";

// --- deterministic PRNG so fixture data is stable across runs (replay) -------
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MetaClient {
  private mode: "fixture" | "live";
  private token?: string;
  private version: string;
  private account: string;

  constructor(opts: MetaClientOptions) {
    this.mode = opts.mode ?? "fixture";
    this.token = opts.accessToken;
    this.version = opts.apiVersion ?? "v21.0";
    this.account = opts.accountExternalId;
  }

  async getInsights(level: Level = "ad"): Promise<InsightRow[]> {
    if (this.mode === "live") return this.getInsightsLive(level);
    return this.getInsightsFixture(level);
  }

  async searchAdLibrary(pageIds: string[]): Promise<AdLibraryRow[]> {
    if (this.mode === "live") return this.searchAdLibraryLive(pageIds);
    return this.searchAdLibraryFixture(pageIds);
  }

  // ---- fixture / replay ----------------------------------------------------
  private getInsightsFixture(level: Level): InsightRow[] {
    const table = (fixtures as any).insights as Record<string, InsightRow[]>;
    if (table[this.account]) {
      return table[this.account].filter((r) => r.level === level || level === "ad");
    }
    return this.synthInsights(level);
  }

  /** Deterministic synthetic ad-level rows for an unknown account. */
  private synthInsights(level: Level): InsightRow[] {
    const rng = mulberry32(hashString(this.account));
    const nCampaigns = 2 + Math.floor(rng() * 2); // 2-3 campaigns
    const rows: InsightRow[] = [];
    for (let c = 0; c < nCampaigns; c++) {
      const campaignId = `${this.account}_camp_${c + 1}`;
      const nAds = 2 + Math.floor(rng() * 3);
      for (let a = 0; a < nAds; a++) {
        const spend = Math.round((20 + rng() * 180) * 100) / 100;
        const impressions = Math.round(2000 + rng() * 40000);
        const clicks = Math.round(impressions * (0.005 + rng() * 0.03));
        const reach = Math.round(impressions / (1.2 + rng() * 2.5));
        const platformConv = Math.round(clicks * (0.02 + rng() * 0.12));
        const adId = `${campaignId}_ad_${a + 1}`;
        rows.push({
          level: "ad",
          external_id: adId,
          campaign_external_id: campaignId,
          adset_external_id: `${campaignId}_set_${a + 1}`,
          spend,
          impressions,
          reach,
          frequency: Math.round((impressions / Math.max(reach, 1)) * 100) / 100,
          ctr: Math.round((clicks / impressions) * 10000) / 10000,
          cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
          cpm: Math.round((spend / (impressions / 1000)) * 100) / 100,
          link_clicks: clicks,
          platform_conversions: platformConv,
          raw: { synthetic: true },
        });
      }
    }
    if (level === "campaign") return rollupToCampaign(rows);
    return rows;
  }

  private searchAdLibraryFixture(pageIds: string[]): AdLibraryRow[] {
    const table = (fixtures as any).adlibrary as Record<string, AdLibraryRow[]>;
    const out: AdLibraryRow[] = [];
    for (const pid of pageIds) {
      if (table[pid]) out.push(...table[pid]);
      else out.push(...this.synthAds(pid));
    }
    return out;
  }

  private synthAds(pageId: string): AdLibraryRow[] {
    const rng = mulberry32(hashString("adlib_" + pageId));
    const n = 2 + Math.floor(rng() * 4);
    const hooks = [
      "Book before spring fills up",
      "Neighbors are already booked",
      "Free estimate this week only",
      "The lawn your street talks about",
      "Weeds gone or it's free",
    ];
    const out: AdLibraryRow[] = [];
    for (let i = 0; i < n; i++) {
      const daysRunning = Math.floor(rng() * 220);
      const started = new Date(Date.UTC(2026, 0, 1) + daysRunning * 0); // stable base
      out.push({
        archive_id: `${pageId}_ad_${i + 1}`,
        page_id: pageId,
        page_name: `Competitor ${pageId}`,
        started_running: `2026-0${1 + (i % 6)}-15`,
        format: rng() > 0.5 ? "video" : "image",
        body: hooks[i % hooks.length],
        headline: hooks[(i + 1) % hooks.length],
        cta: rng() > 0.5 ? "Book Now" : "Get Quote",
        platforms: ["facebook", "instagram"],
        raw: { synthetic: true, days_running_hint: daysRunning },
      });
    }
    return out;
  }

  // ---- live ----------------------------------------------------------------
  private async getInsightsLive(level: Level): Promise<InsightRow[]> {
    if (!this.token) throw new Error("Meta live mode requires an access token.");
    const fields =
      "spend,impressions,reach,frequency,ctr,cpc,cpm,inline_link_clicks,actions,campaign_id,adset_id,ad_id";
    const url =
      `${GRAPH}/${this.version}/${this.account}/insights` +
      `?level=${level}&fields=${encodeURIComponent(fields)}` +
      `&date_preset=today&access_token=${this.token}`;
    const data = await this.fetchJson(url);
    const rows: InsightRow[] = (data.data ?? []).map((r: any) => ({
      level,
      external_id: r.ad_id ?? r.adset_id ?? r.campaign_id,
      campaign_external_id: r.campaign_id,
      adset_external_id: r.adset_id,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      reach: Number(r.reach ?? 0),
      frequency: Number(r.frequency ?? 0),
      ctr: Number(r.ctr ?? 0) / 100,
      cpc: Number(r.cpc ?? 0),
      cpm: Number(r.cpm ?? 0),
      link_clicks: Number(r.inline_link_clicks ?? 0),
      platform_conversions: extractConversions(r.actions),
      raw: r,
    }));
    return rows;
  }

  private async searchAdLibraryLive(pageIds: string[]): Promise<AdLibraryRow[]> {
    if (!this.token) throw new Error("Meta live mode requires an access token.");
    const out: AdLibraryRow[] = [];
    for (const pid of pageIds) {
      const url =
        `${GRAPH}/${this.version}/ads_archive` +
        `?search_page_ids=${pid}&ad_reached_countries=['US']` +
        `&fields=id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_creative_bodies,ad_creative_link_titles,publisher_platforms` +
        `&access_token=${this.token}`;
      const data = await this.fetchJson(url);
      for (const r of data.data ?? []) {
        out.push({
          archive_id: String(r.id),
          page_id: String(r.page_id ?? pid),
          page_name: r.page_name,
          started_running: r.ad_delivery_start_time,
          format: undefined,
          body: (r.ad_creative_bodies ?? [])[0],
          headline: (r.ad_creative_link_titles ?? [])[0],
          platforms: r.publisher_platforms,
          raw: r,
        });
      }
    }
    return out;
  }

  private async fetchJson(url: string, attempt = 0): Promise<any> {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(body.error.message ?? "Meta API error");
      return body;
    } catch (e) {
      if (attempt < 3) {
        await sleep(400 * Math.pow(2, attempt));
        return this.fetchJson(url, attempt + 1);
      }
      throw e;
    }
  }
}

function extractConversions(actions: any[]): number {
  if (!Array.isArray(actions)) return 0;
  const hit = actions.find((a) =>
    ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"].includes(
      a.action_type
    )
  );
  return hit ? Number(hit.value ?? 0) : 0;
}

export function rollupToCampaign(rows: InsightRow[]): InsightRow[] {
  const byCampaign = new Map<string, InsightRow>();
  for (const r of rows) {
    const key = r.campaign_external_id;
    const acc = byCampaign.get(key);
    if (!acc) {
      byCampaign.set(key, {
        ...r,
        level: "campaign",
        external_id: key,
      });
    } else {
      acc.spend += r.spend;
      acc.impressions += r.impressions;
      acc.reach += r.reach;
      acc.link_clicks += r.link_clicks;
      acc.platform_conversions += r.platform_conversions;
      acc.cpm =
        acc.impressions > 0 ? (acc.spend / (acc.impressions / 1000)) : 0;
      acc.ctr = acc.impressions > 0 ? acc.link_clicks / acc.impressions : 0;
      acc.cpc = acc.link_clicks > 0 ? acc.spend / acc.link_clicks : 0;
      acc.frequency = acc.reach > 0 ? acc.impressions / acc.reach : 0;
    }
  }
  return [...byCampaign.values()];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
