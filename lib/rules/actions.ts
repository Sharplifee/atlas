import type { SupabaseClient } from "@supabase/supabase-js";
import { clampDailyCap } from "@/lib/rules/invariants";

type DB = SupabaseClient<any, any, any>;

export interface ActionOutcome {
  ok: boolean;
  error?: string;
}

/**
 * Approve a queued action. For a queued budget change this is the ONLY path
 * that executes it — the engine never auto-executes a scale-gated change.
 */
export async function approveEvent(
  db: DB,
  workspaceId: string,
  userId: string,
  eventId: string
): Promise<ActionOutcome> {
  const { data: ev } = await db
    .from("rule_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return { ok: false, error: "event not found" };
  if (ev.approved_at) return { ok: true };

  // Execute the effect now.
  if (ev.action === "budget_change" && ev.campaign_external_id) {
    const after = (ev.detail as any)?.after?.daily_cap;
    if (typeof after === "number") {
      await db
        .from("campaigns")
        .update({ daily_cap: after })
        .eq("workspace_id", workspaceId)
        .eq("external_id", ev.campaign_external_id);
    }
  }

  const { error } = await db
    .from("rule_events")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: userId,
      executed: true,
      needs_approval: false,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Revert an executed action using detail.before. Every executed action is
 * reversible in a single call.
 */
export async function revertEvent(
  db: DB,
  workspaceId: string,
  eventId: string
): Promise<ActionOutcome> {
  const { data: ev } = await db
    .from("rule_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return { ok: false, error: "event not found" };
  if (ev.reverted_at) return { ok: true };

  const before = (ev.detail as any)?.before ?? {};
  if (ev.action === "budget_change" && ev.campaign_external_id && before.daily_cap != null) {
    await db
      .from("campaigns")
      .update({ daily_cap: before.daily_cap })
      .eq("workspace_id", workspaceId)
      .eq("external_id", ev.campaign_external_id);
  }
  if (ev.action === "pause" && ev.campaign_external_id && before.status) {
    await db
      .from("campaigns")
      .update({ status: before.status })
      .eq("workspace_id", workspaceId)
      .eq("external_id", ev.campaign_external_id);
  }

  const { error } = await db
    .from("rule_events")
    .update({ reverted_at: new Date().toISOString(), executed: false })
    .eq("workspace_id", workspaceId)
    .eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Guardrail helper re-exported for callers that adjust caps directly. */
export { clampDailyCap };
