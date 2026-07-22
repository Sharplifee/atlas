"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type SlotStatus = "proposed" | "approved" | "edited" | "rejected" | "shipped";

export async function updateSlotStatus(
  slotId: string,
  status: SlotStatus
): Promise<void> {
  const ctx = await requireMember("analyst");
  const db = await createClient();
  await db
    .from("creative_slots")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("workspace_id", ctx.workspace.id)
    .eq("id", slotId);
  revalidatePath("/calendar");
}
