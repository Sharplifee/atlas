"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  buildAttributionContext,
  ingestOutcome,
  type OutcomeInput,
} from "@/lib/ingest/outcomes";
import type { ActionResult } from "@/lib/actions/auth";
import type { OutcomeStage } from "@/lib/types";

function sha256(v: string): string {
  return "sha256:" + createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
}

async function getOrCreateSource(
  db: any,
  workspaceId: string,
  kind: string,
  name: string
): Promise<string> {
  const { data: existing } = await db
    .from("outcome_sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await db
    .from("outcome_sources")
    .insert({ workspace_id: workspaceId, kind, name, secret: randomUUID() })
    .select("id")
    .single();
  return created.id;
}

export async function addManualOutcome(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireMember("analyst");
  const stage = String(formData.get("stage") ?? "lead") as OutcomeStage;
  const valueRaw = String(formData.get("value") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const input: OutcomeInput = {
    stage,
    value: valueRaw ? Number(valueRaw) : null,
    occurred_at: String(formData.get("occurred_at") ?? "").trim() || null,
    campaign_external_id: String(formData.get("campaign_external_id") ?? "").trim() || null,
    ad_external_id: String(formData.get("ad_external_id") ?? "").trim() || null,
    click_id: String(formData.get("click_id") ?? "").trim() || null,
    contact_hash: contact ? sha256(contact) : null,
    manual: true,
    external_ref: `manual_${randomUUID()}`,
  };

  const db = await createClient();
  const sourceId = await getOrCreateSource(db, ctx.workspace.id, "manual", "Manual entry");
  const r = await ingestOutcome(db, ctx.workspace.id, sourceId, input);
  if (!r.ok) return { error: r.error ?? "failed to add outcome" };

  revalidatePath("/outcomes");
  revalidatePath("/");
}

export interface CsvOutcomeRow {
  external_ref?: string;
  occurred_at?: string;
  stage: string;
  value?: string | number;
  click_id?: string;
  utm_campaign?: string;
  utm_content?: string;
  campaign_external_id?: string;
  ad_external_id?: string;
  contact?: string;
}

export async function importCsvOutcomes(
  rows: CsvOutcomeRow[]
): Promise<{ accepted: number; matched: number; errors: number }> {
  const ctx = await requireMember("analyst");
  const db = await createClient();
  const sourceId = await getOrCreateSource(db, ctx.workspace.id, "csv", "CSV import");
  const attrCtx = await buildAttributionContext(db, ctx.workspace.id);

  let accepted = 0;
  let matched = 0;
  let errors = 0;
  for (const row of rows.slice(0, 5000)) {
    const stage = (row.stage || "lead").toLowerCase() as OutcomeStage;
    const input: OutcomeInput = {
      external_ref: row.external_ref || `csv_${randomUUID()}`,
      occurred_at: row.occurred_at || null,
      stage,
      value: row.value != null && row.value !== "" ? Number(row.value) : null,
      click_id: row.click_id || null,
      utm:
        row.utm_campaign || row.utm_content
          ? { campaign: row.utm_campaign ?? "", content: row.utm_content ?? "" }
          : null,
      campaign_external_id: row.campaign_external_id || null,
      ad_external_id: row.ad_external_id || null,
      contact_hash: row.contact ? sha256(row.contact) : null,
    };
    const r = await ingestOutcome(db, ctx.workspace.id, sourceId, input, attrCtx);
    if (r.ok) {
      accepted += 1;
      if (r.matched_by && r.matched_by !== "unmatched") matched += 1;
    } else {
      errors += 1;
    }
  }

  revalidatePath("/outcomes");
  revalidatePath("/");
  return { accepted, matched, errors };
}
