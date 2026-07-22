import { checkCronAuth, json } from "@/lib/cron";
import { runAgentAllWorkspaces } from "@/lib/agent/atlas";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron: 30 3 * * *
export async function GET(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  if (!env.agentEnabled()) {
    return json({ ok: true, disabled: true, note: "ATLAS_AGENT_ENABLED is not true" });
  }
  try {
    const results = await runAgentAllWorkspaces("nightly");
    return json({ ok: true, results });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
}
