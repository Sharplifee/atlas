import { json } from "@/lib/cron";
import { createClient } from "@/lib/supabase/server";
import { getActiveMembership, roleAtLeast } from "@/lib/auth";
import { approveEvent } from "@/lib/rules/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getActiveMembership();
  if (!ctx) return json({ error: "unauthorized" }, 401);
  if (!roleAtLeast(ctx.role, "analyst")) return json({ error: "forbidden" }, 403);

  const db = await createClient();
  const r = await approveEvent(db, ctx.workspace.id, ctx.userId, id);
  return json(r, r.ok ? 200 : 400);
}
