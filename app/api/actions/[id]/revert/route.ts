import { json } from "@/lib/cron";
import { createClient } from "@/lib/supabase/server";
import { getActiveMembership, roleAtLeast } from "@/lib/auth";
import { revertEvent } from "@/lib/rules/actions";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function __POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getActiveMembership();
  if (!ctx) return json({ error: "unauthorized" }, 401);
  if (!roleAtLeast(ctx.role, "analyst")) return json({ error: "forbidden" }, 403);

  const db = await createClient();
  const r = await revertEvent(db, ctx.workspace.id, id);
  return json(r, r.ok ? 200 : 400);
}

export const POST = withEventLog("POST /api/actions/[id]/revert", __POST);
