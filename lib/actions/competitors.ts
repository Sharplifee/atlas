"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runCompetitorPull } from "@/lib/pull/competitors";
import { runSignalPull } from "@/lib/pull/signals";
import type { ActionResult } from "@/lib/actions/auth";

export async function addCompetitorPage(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireMember("analyst");
  const page_id = String(formData.get("page_id") ?? "").trim();
  const page_name = String(formData.get("page_name") ?? "").trim() || null;
  if (!page_id) return { error: "Enter a Meta page id to track." };

  const db = await createClient();
  const { error } = await db.from("competitor_pages").insert({
    workspace_id: ctx.workspace.id,
    platform: "meta",
    page_id,
    page_name,
  });
  if (error) return { error: error.message };
  revalidatePath("/competitors");
}

export async function triggerCompetitorPull(): Promise<void> {
  const ctx = await requireMember("analyst");
  await runCompetitorPull({ workspaceId: ctx.workspace.id });
  revalidatePath("/competitors");
}

export async function triggerSignalPull(): Promise<void> {
  const ctx = await requireMember("analyst");
  await runSignalPull({ workspaceId: ctx.workspace.id });
  revalidatePath("/signals");
}
