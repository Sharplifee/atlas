"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runMetricsPull } from "@/lib/pull/metrics";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/actions/auth";

export async function connectAdAccount(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireMember("owner");
  const external_id = String(formData.get("external_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || external_id;
  const platform = String(formData.get("platform") ?? "meta").trim();
  const token = String(formData.get("token") ?? "").trim();

  if (!external_id) return { error: "Enter the ad account external id (e.g. act_123)." };
  if (env.metaMode() === "live" && !token && platform === "meta") {
    return { error: "Live mode needs a System User token. Or set META_MODE=fixture to test." };
  }

  let encrypted: string | null = null;
  if (token) {
    try {
      encrypted = encrypt(token);
    } catch (e: any) {
      return { error: `Cannot encrypt token: ${e?.message}. Is ENCRYPTION_KEY set?` };
    }
  }

  const db = await createClient();
  const { error } = await db.from("ad_accounts").insert({
    workspace_id: ctx.workspace.id,
    platform,
    external_id,
    name,
    access_token_encrypted: encrypted,
    status: "active",
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
}

export async function triggerMetricsPull(): Promise<void> {
  const ctx = await requireMember("analyst");
  await runMetricsPull({ workspaceId: ctx.workspace.id });
  revalidatePath("/");
  revalidatePath("/campaigns");
  revalidatePath("/rules");
}
