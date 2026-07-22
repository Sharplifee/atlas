import { env } from "@/lib/env";

/**
 * Authenticate an automation request (cron pulls, agent runs).
 * Accepts either `Authorization: Bearer <CRON_SECRET>` (Vercel Cron style) or
 * an `x-cron-secret` header. Returns null when authorized, or a Response to
 * return immediately when not.
 */
export function checkCronAuth(req: Request): Response | null {
  const secret = env.cronSecret();
  if (!secret) {
    return json({ error: "CRON_SECRET is not configured" }, 503);
  }
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = req.headers.get("x-cron-secret");
  if (bearer === secret || header === secret) return null;
  return json({ error: "unauthorized" }, 401);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
