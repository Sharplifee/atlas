import { json } from "@/lib/cron";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness probe. Reports configuration status without leaking secrets. */
export async function GET() {
  return json({
    ok: true,
    service: "atlas",
    configured: env.isConfigured(),
    meta_mode: env.metaMode(),
    agent_enabled: env.agentEnabled(),
    time: new Date().toISOString(),
  });
}
