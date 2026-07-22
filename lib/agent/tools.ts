import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<any, any, any>;

/**
 * Atlas tool surface. READ-ONLY except the two writes (write_brief,
 * propose_creative_slots) and request_approval. Atlas cannot call any ad
 * platform API, change any budget, arm any rule, or write to any other table.
 */
export const AGENT_TOOLS = [
  {
    name: "query_metrics",
    description:
      "Latest metric snapshots for the workspace. Judge on cost_per_outcome and roas, never platform_conversions.",
    input_schema: {
      type: "object" as const,
      properties: {
        level: { type: "string", enum: ["campaign", "ad"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "query_outcomes",
    description: "Recent outcomes with attribution. Use to assess coverage and closed revenue.",
    input_schema: {
      type: "object" as const,
      properties: { days: { type: "number" } },
    },
  },
  {
    name: "query_competitors",
    description: "Active competitor ads with run-length. Long run-length = proven demand.",
    input_schema: {
      type: "object" as const,
      properties: { days: { type: "number" } },
    },
  },
  {
    name: "query_signals",
    description: "Recent market signals (season, trend, weather).",
    input_schema: {
      type: "object" as const,
      properties: { days: { type: "number" } },
    },
  },
  {
    name: "read_rule_events",
    description: "Recent rule engine events (executed, shadowed, or queued).",
    input_schema: {
      type: "object" as const,
      properties: { days: { type: "number" } },
    },
  },
  {
    name: "write_brief",
    description:
      "Persist a strategist brief. Every claim MUST cite the row ids behind it in `cited`.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: ["nightly", "weekly", "event"] },
        body_md: { type: "string" },
        cited: { type: "array", items: { type: "string" } },
      },
      required: ["kind", "body_md"],
    },
  },
  {
    name: "propose_creative_slots",
    description: "Propose creative calendar slots (status starts as proposed).",
    input_schema: {
      type: "object" as const,
      properties: {
        slots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slot_date: { type: "string" },
              campaign_hint: { type: "string" },
              geo: { type: "string" },
              format: { type: "string" },
              hook: { type: "string" },
              copy_draft: { type: "string" },
              visual_brief: { type: "string" },
              offer: { type: "string" },
              intent: { type: "string" },
            },
            required: ["slot_date", "hook"],
          },
        },
      },
      required: ["slots"],
    },
  },
  {
    name: "request_approval",
    description: "Ask a human to approve a strategy change. Atlas never moves money itself.",
    input_schema: {
      type: "object" as const,
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
];

export async function executeTool(
  db: DB,
  workspaceId: string,
  name: string,
  input: any,
  briefIdRef: { id: string | null }
): Promise<unknown> {
  const since = (days: number) =>
    new Date(Date.now() - days * 86400_000).toISOString();

  switch (name) {
    case "query_metrics": {
      const { data } = await db
        .from("metric_snapshots")
        .select("id, level, external_id, campaign_external_id, spend, cost_per_lead, cost_per_outcome, roas, attributed_leads, attributed_closed, attributed_revenue, pulled_at")
        .eq("workspace_id", workspaceId)
        .eq("level", input?.level ?? "campaign")
        .order("pulled_at", { ascending: false })
        .limit(Math.min(input?.limit ?? 100, 300));
      return data ?? [];
    }
    case "query_outcomes": {
      const { data } = await db
        .from("outcomes")
        .select("id, stage, value, matched_by, campaign_external_id, occurred_at")
        .eq("workspace_id", workspaceId)
        .gte("occurred_at", since(input?.days ?? 14))
        .order("occurred_at", { ascending: false })
        .limit(500);
      return data ?? [];
    }
    case "query_competitors": {
      const { data } = await db
        .from("competitor_ads")
        .select("id, page_id, headline, body, offer_extracted, angle_extracted, started_running, last_seen, active")
        .eq("workspace_id", workspaceId)
        .gte("last_seen", since(input?.days ?? 30).slice(0, 10))
        .limit(200);
      return data ?? [];
    }
    case "query_signals": {
      const { data } = await db
        .from("signals")
        .select("id, kind, key, value, score, captured_at")
        .eq("workspace_id", workspaceId)
        .gte("captured_at", since(input?.days ?? 14))
        .order("captured_at", { ascending: false })
        .limit(100);
      return data ?? [];
    }
    case "read_rule_events": {
      const { data } = await db
        .from("rule_events")
        .select("id, rule_key, action, external_id, executed, needs_approval, created_at")
        .eq("workspace_id", workspaceId)
        .gte("created_at", since(input?.days ?? 14))
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    }
    case "write_brief": {
      const { data, error } = await db
        .from("briefs")
        .insert({
          workspace_id: workspaceId,
          kind: input.kind,
          body_md: input.body_md,
          cited: input.cited ?? [],
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      briefIdRef.id = data.id;
      return { ok: true, brief_id: data.id };
    }
    case "propose_creative_slots": {
      const slots = (input.slots ?? []).map((s: any) => ({
        workspace_id: workspaceId,
        slot_date: s.slot_date,
        campaign_hint: s.campaign_hint ?? null,
        geo: s.geo ?? null,
        format: s.format ?? null,
        hook: s.hook,
        copy_draft: s.copy_draft ?? null,
        visual_brief: s.visual_brief ?? null,
        offer: s.offer ?? null,
        intent: s.intent ?? null,
        status: "proposed",
        brief_id: briefIdRef.id,
      }));
      if (slots.length === 0) return { ok: true, count: 0 };
      const { error } = await db.from("creative_slots").insert(slots);
      if (error) return { ok: false, error: error.message };
      return { ok: true, count: slots.length };
    }
    case "request_approval": {
      const { data, error } = await db
        .from("rule_events")
        .insert({
          workspace_id: workspaceId,
          rule_key: "agent_request",
          action: "flag",
          detail: { summary: input.summary, source: "atlas_agent" },
          executed: false,
          needs_approval: true,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, request_id: data.id };
    }
    default:
      return { ok: false, error: `unknown tool: ${name}` };
  }
}
