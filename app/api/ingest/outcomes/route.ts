import { json } from "@/lib/cron";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildAttributionContext,
  ingestOutcome,
  type OutcomeInput,
} from "@/lib/ingest/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Primary outcome intake. Authenticated by the source's secret in `x-atlas-key`.
 * Accepts a single outcome or an array. Idempotent on external_ref.
 *
 * Any sender that can fire an HTTP request can feed Atlas — this is the
 * decoupling layer. Atlas never reaches into anyone's CRM.
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-atlas-key");
  if (!key) return json({ error: "missing x-atlas-key" }, 401);

  const db = createServiceClient();
  const { data: source } = await db
    .from("outcome_sources")
    .select("id, workspace_id, active")
    .eq("secret", key)
    .maybeSingle();

  if (!source || !source.active) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const items: OutcomeInput[] = Array.isArray(body)
    ? (body as OutcomeInput[])
    : [body as OutcomeInput];
  if (items.length === 0) return json({ error: "empty payload" }, 400);
  if (items.length > 500) return json({ error: "max 500 outcomes per request" }, 400);

  // Build the attribution context once for the whole batch.
  const ctx = await buildAttributionContext(db, source.workspace_id);

  const results = [];
  for (const item of items) {
    const r = await ingestOutcome(db, source.workspace_id, source.id, item, ctx);
    results.push(r);
  }

  const accepted = results.filter((r) => r.ok).length;
  const matched = results.filter((r) => r.ok && r.matched_by !== "unmatched").length;
  return json({
    ok: true,
    accepted,
    rejected: results.length - accepted,
    matched,
    unmatched: accepted - matched,
    results,
  });
}
