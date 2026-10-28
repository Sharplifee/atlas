import { checkCronAuth, json } from "@/lib/cron";
import { runMetricsPull } from "@/lib/pull/metrics";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron: */15 * * * *  (see vercel.json)
async function __GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace") ?? undefined;

  try {
    const result = await runMetricsPull({ workspaceId });
    return json({ ok: true, ...result });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
}

export const GET = withEventLog("GET /api/pull/metrics", __GET);
