import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { MetaClient, type AdLibraryRow } from "@/lib/platforms/meta";
import { env } from "@/lib/env";

/**
 * Competitor pipeline. Idempotent upserts on archive_id; ads that disappear
 * flip to inactive (run-length is the signal). Offer/angle are extracted
 * heuristically here — when the agent is enabled this can be upgraded to a
 * single cheap model pass on NEW ads only.
 */

function creativeHash(ad: AdLibraryRow): string {
  return createHash("sha1")
    .update(`${ad.body ?? ""}|${ad.headline ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

function extractOffer(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bfree\b/.test(t)) return "free offer";
  if (/guarantee/.test(t)) return "guarantee";
  if (/%|percent|discount|off\b/.test(t)) return "discount";
  if (/book|booking|schedule/.test(t)) return "book now";
  return null;
}

function extractAngle(text: string): string | null {
  const t = text.toLowerCase();
  if (/neighbor|street|block/.test(t)) return "social proof / local";
  if (/spring|summer|fall|winter|season/.test(t)) return "seasonal urgency";
  if (/guarantee|or it'?s free/.test(t)) return "risk reversal";
  return null;
}

export interface CompetitorPullResult {
  workspaces: number;
  pages: number;
  upserted: number;
  deactivated: number;
  errors: string[];
}

export async function runCompetitorPull(opts?: {
  workspaceId?: string;
}): Promise<CompetitorPullResult> {
  const db = createServiceClient();
  const res: CompetitorPullResult = {
    workspaces: 0,
    pages: 0,
    upserted: 0,
    deactivated: 0,
    errors: [],
  };

  let q = db.from("competitor_pages").select("*").eq("active", true);
  if (opts?.workspaceId) q = q.eq("workspace_id", opts.workspaceId);
  const { data: pages } = await q;
  if (!pages || pages.length === 0) return res;

  const byWorkspace = new Map<string, any[]>();
  for (const p of pages) {
    const arr = byWorkspace.get(p.workspace_id) ?? [];
    arr.push(p);
    byWorkspace.set(p.workspace_id, arr);
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [workspaceId, wsPages] of byWorkspace) {
    res.workspaces += 1;
    try {
      const client = new MetaClient({
        mode: env.metaMode(),
        apiVersion: env.metaApiVersion(),
        accountExternalId: "adlibrary",
      });
      const pageIds = wsPages.map((p) => p.page_id);
      const ads = await client.searchAdLibrary(pageIds);
      res.pages += pageIds.length;

      // existing archive ids for these pages
      const { data: existing } = await db
        .from("competitor_ads")
        .select("archive_id, page_id, active")
        .eq("workspace_id", workspaceId)
        .in("page_id", pageIds);
      const seenNow = new Set(ads.map((a) => a.archive_id));

      const rows = ads.map((a) => ({
        workspace_id: workspaceId,
        page_id: a.page_id,
        archive_id: a.archive_id,
        started_running: a.started_running ?? null,
        first_seen: today,
        last_seen: today,
        format: a.format ?? null,
        body: a.body ?? null,
        headline: a.headline ?? null,
        cta: a.cta ?? null,
        offer_extracted: extractOffer(`${a.body ?? ""} ${a.headline ?? ""}`),
        angle_extracted: extractAngle(`${a.body ?? ""} ${a.headline ?? ""}`),
        creative_hash: creativeHash(a),
        platforms: a.platforms ?? [],
        active: true,
        raw: a.raw ?? null,
      }));

      if (rows.length > 0) {
        // Do not clobber first_seen on re-upsert: only set last_seen/active fresh.
        const { error } = await db
          .from("competitor_ads")
          .upsert(rows, { onConflict: "workspace_id,archive_id", ignoreDuplicates: false });
        if (error) throw new Error(error.message);
        // repair last_seen for all currently-seen ads
        await db
          .from("competitor_ads")
          .update({ last_seen: today, active: true })
          .eq("workspace_id", workspaceId)
          .in("archive_id", [...seenNow]);
        res.upserted += rows.length;
      }

      // deactivate disappeared ads
      const disappeared = (existing ?? [])
        .filter((e) => e.active && !seenNow.has(e.archive_id))
        .map((e) => e.archive_id);
      if (disappeared.length > 0) {
        await db
          .from("competitor_ads")
          .update({ active: false })
          .eq("workspace_id", workspaceId)
          .in("archive_id", disappeared);
        res.deactivated += disappeared.length;
      }
    } catch (e: any) {
      res.errors.push(`${workspaceId}: ${e?.message ?? e}`);
    }
  }

  return res;
}
