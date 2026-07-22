import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<any, any, any>;

/**
 * Validate the agent's output contract before it stands as final:
 *  - every cited id must resolve to a real row in the workspace
 *  - the weekly brief must carry at least one cited id (no uncited claims)
 */
export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

export async function validateBrief(
  db: DB,
  workspaceId: string,
  briefId: string
): Promise<ValidationResult> {
  const problems: string[] = [];
  const { data: brief } = await db
    .from("briefs")
    .select("cited, kind, body_md")
    .eq("workspace_id", workspaceId)
    .eq("id", briefId)
    .maybeSingle();

  if (!brief) return { ok: false, problems: ["brief not found"] };

  const cited: string[] = Array.isArray(brief.cited) ? brief.cited : [];
  if (brief.kind === "weekly" && cited.length === 0) {
    problems.push("weekly brief has no cited rows — uncited claims are not allowed");
  }

  // Each cited id must exist in one of the queryable source tables.
  const tables = ["metric_snapshots", "outcomes", "competitor_ads", "signals", "rule_events"];
  for (const id of cited.slice(0, 200)) {
    let found = false;
    for (const t of tables) {
      const { data } = await db
        .from(t)
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle();
      if (data) {
        found = true;
        break;
      }
    }
    if (!found) problems.push(`cited id does not resolve to a real row: ${id}`);
  }

  return { ok: problems.length === 0, problems };
}
