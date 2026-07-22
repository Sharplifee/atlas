import { checkCronAuth, json } from "@/lib/cron";
import { runSignalPull } from "@/lib/pull/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron: 40 6 * * *
export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace") ?? undefined;
  try {
    const result = await runSignalPull({ workspaceId });
    return json({ ok: true, ...result });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
}
