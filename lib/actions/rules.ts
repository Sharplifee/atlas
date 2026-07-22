"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { approveEvent, revertEvent } from "@/lib/rules/actions";
import type { RuleKey } from "@/lib/types";

export async function setRuleFlag(
  key: RuleKey,
  patch: { enabled?: boolean; armed?: boolean }
): Promise<void> {
  const ctx = await requireMember("owner");
  const db = await createClient();
  await db
    .from("rules")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("workspace_id", ctx.workspace.id)
    .eq("key", key);
  revalidatePath("/rules");
}

export async function updateRuleParams(formData: FormData): Promise<void> {
  const ctx = await requireMember("owner");
  const key = String(formData.get("key")) as RuleKey;
  const db = await createClient();
  const { data: rule } = await db
    .from("rules")
    .select("params")
    .eq("workspace_id", ctx.workspace.id)
    .eq("key", key)
    .maybeSingle();
  if (!rule) return;

  const params: Record<string, number> = { ...(rule.params as any) };
  for (const [k, v] of formData.entries()) {
    if (k === "key") continue;
    const n = Number(v);
    if (!Number.isNaN(n)) params[k] = n;
  }
  await db
    .from("rules")
    .update({ params, updated_at: new Date().toISOString() })
    .eq("workspace_id", ctx.workspace.id)
    .eq("key", key);
  revalidatePath("/rules");
}

export async function approveAction(eventId: string): Promise<void> {
  const ctx = await requireMember("analyst");
  const db = await createClient();
  await approveEvent(db, ctx.workspace.id, ctx.userId, eventId);
  revalidatePath("/rules");
  revalidatePath("/");
}

export async function revertAction(eventId: string): Promise<void> {
  const ctx = await requireMember("analyst");
  const db = await createClient();
  await revertEvent(db, ctx.workspace.id, eventId);
  revalidatePath("/rules");
  revalidatePath("/");
}

/** Arm the whole engine (owner only) — the A8 go-live switch, per rule. */
export async function armWorkspace(shadow: boolean): Promise<void> {
  const ctx = await requireMember("owner");
  const db = await createClient();
  const settings = {
    ...(ctx.workspace.settings as any),
    atlas: { ...(ctx.workspace.settings as any)?.atlas, shadow },
  };
  await db
    .from("workspaces")
    .update({ settings })
    .eq("id", ctx.workspace.id);
  revalidatePath("/rules");
  revalidatePath("/");
}
