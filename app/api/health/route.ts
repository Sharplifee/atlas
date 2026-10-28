import { json } from "@/lib/cron";
import { env } from "@/lib/env";
import { withEventLog } from "@/lib/eventLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness probe. Reports configuration status without leaking secrets. */
async function __GET() {
  return json({
    ok: true,
    service: "atlas",
    configured: env.isConfigured(),
    meta_mode: env.metaMode(),
    agent_enabled: env.agentEnabled(),
    time: new Date().toISOString(),
  });
}

export const GET = withEventLog("GET /api/health", __GET);
