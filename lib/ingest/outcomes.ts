import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  resolveAttribution,
  type AttributionContext,
  type AttributionInput,
} from "@/lib/attribution";
import type { OutcomeStage } from "@/lib/types";

type DB = SupabaseClient<any, any, any>;

export interface OutcomeInput {
  external_ref?: string | null;
  occurred_at?: string | null;
  stage: OutcomeStage;
  value?: number | null;
  click_id?: string | null;
  utm?: Record<string, string> | null;
  campaign_external_id?: string | null;
  ad_external_id?: string | null;
  contact_hash?: string | null;
  manual?: boolean;
  raw?: unknown;
}

/** Load the attribution context for a workspace (known ids + prior leads). */
export async function buildAttributionContext(
  db: DB,
  workspaceId: string
): Promise<AttributionContext> {
  const [{ data: campaigns }, { data: snaps }, { data: priors }] =
    await Promise.all([
      db.from("campaigns").select("external_id").eq("workspace_id", workspaceId),
      db
        .from("metric_snapshots")
        .select("external_id, campaign_external_id, level")
        .eq("workspace_id", workspaceId)
        .eq("level", "ad")
        .limit(3000),
      db
        .from("outcomes")
        .select("contact_hash, campaign_external_id, ad_external_id, matched_by")
        .eq("workspace_id", workspaceId)
        .not("contact_hash", "is", null)
        .neq("matched_by", "unmatched")
        .limit(5000),
    ]);

  const knownCampaignIds = new Set<string>();
  const knownAdIds = new Set<string>();
  for (const c of campaigns ?? []) knownCampaignIds.add(c.external_id);
  for (const s of snaps ?? []) {
    if (s.external_id) knownAdIds.add(s.external_id);
    if (s.campaign_external_id) knownCampaignIds.add(s.campaign_external_id);
  }

  const priorByContact = new Map<
    string,
    { campaign_external_id: string | null; ad_external_id: string | null }
  >();
  for (const p of priors ?? []) {
    if (p.contact_hash && !priorByContact.has(p.contact_hash)) {
      priorByContact.set(p.contact_hash, {
        campaign_external_id: p.campaign_external_id ?? null,
        ad_external_id: p.ad_external_id ?? null,
      });
    }
  }

  return { knownAdIds, knownCampaignIds, priorByContact };
}

export interface IngestResult {
  ok: boolean;
  id?: string;
  matched_by?: string;
  deduped?: boolean;
  error?: string;
}

/** Resolve attribution and upsert an outcome idempotently. */
export async function ingestOutcome(
  db: DB,
  workspaceId: string,
  sourceId: string | null,
  input: OutcomeInput,
  ctx?: AttributionContext
): Promise<IngestResult> {
  if (!input.stage) return { ok: false, error: "stage is required" };

  const context = ctx ?? (await buildAttributionContext(db, workspaceId));
  const attrInput: AttributionInput = {
    click_id: input.click_id,
    utm: input.utm,
    campaign_external_id: input.campaign_external_id,
    ad_external_id: input.ad_external_id,
    contact_hash: input.contact_hash,
    manual: input.manual,
  };
  const attr = resolveAttribution(attrInput, context);

  const external_ref = input.external_ref?.trim() || `gen_${randomUUID()}`;
  const row = {
    workspace_id: workspaceId,
    source_id: sourceId,
    external_ref,
    occurred_at: input.occurred_at || new Date().toISOString(),
    stage: input.stage,
    value: input.value ?? null,
    click_id: input.click_id ?? null,
    utm: input.utm ?? null,
    campaign_external_id: attr.campaign_external_id,
    ad_external_id: attr.ad_external_id,
    contact_hash: input.contact_hash ?? null,
    matched_by: attr.matched_by,
    raw: input.raw ?? null,
  };

  // Idempotent on (workspace_id, source_id, external_ref).
  const { data, error } = await db
    .from("outcomes")
    .upsert(row, { onConflict: "workspace_id,source_id,external_ref" })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id, matched_by: attr.matched_by };
}
