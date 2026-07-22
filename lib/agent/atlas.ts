import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { AGENT_TOOLS, executeTool } from "@/lib/agent/tools";
import { validateBrief } from "@/lib/agent/validate";

export const ATLAS_SYSTEM_PROMPT = `You are Atlas, an advertising strategist. You optimize for cost per closed outcome and collected revenue — never clicks, never impressions, never platform-reported conversions. Every claim you make must cite the data rows behind it; put their ids in \`cited\`. Doctrine: creative diversity beats single-ad dependence; budget moves step, never leap; signal quality is a first-class health metric; a competitor ad that has run for months is proven demand worth beating, not copying; when demand signals rise, creative ships before the peak, not after. State uncertainty plainly — if attribution coverage is weak, say so and lower your confidence rather than inventing a story. You propose; the human disposes. Write in plain English, decisions first, no filler.

You cannot call any ad platform API, change any budget, arm any rule, or publish any creative. Your only writes are write_brief and propose_creative_slots, plus request_approval to ask a human.`;

const NIGHTLY_TASK = `Produce tonight's nightly digest. First read metrics, outcomes, rule events, and signals. Then call write_brief with kind="nightly" and a body of AT MOST 10 lines covering: rule actions taken, drift detected, and anything urgent. Cite the row ids you relied on.`;

const WEEKLY_TASK = `Produce the weekly synthesis. Read metrics, outcomes, competitors, signals, and rule events. Then:
1. write_brief (kind="weekly") — a strategy brief: what's working by revenue, what's dying, competitor proof, rising demand. Every section cites row ids in \`cited\`.
2. propose_creative_slots — a rolling 2-week creative calendar: for each slot include date, campaign hint, geo, format, hook, full copy draft, visual brief, and intent.
3. If any allocation change exceeds the rails, call request_approval with a crisp summary. Never assume it is approved.`;

export interface AgentRunResult {
  ok: boolean;
  disabled?: boolean;
  error?: string;
  tokens?: number;
  brief_id?: string | null;
  validation?: { ok: boolean; problems: string[] };
}

export async function runAgent(
  kind: "nightly" | "weekly" | "event",
  workspaceId: string,
  eventContext?: string
): Promise<AgentRunResult> {
  // Hard gate: the agent is OFF unless BOTH the flag and a key are present.
  if (!env.agentEnabled()) return { ok: false, disabled: true, error: "ATLAS_AGENT_ENABLED is not true" };
  const apiKey = env.anthropicKey();
  if (!apiKey) return { ok: false, disabled: true, error: "ANTHROPIC_API_KEY is not set" };

  const db = createServiceClient();
  const { data: run } = await db
    .from("agent_runs")
    .insert({ workspace_id: workspaceId, kind: `agent:${kind}` })
    .select("id")
    .single();

  const client = new Anthropic({ apiKey });
  const briefIdRef: { id: string | null } = { id: null };
  let tokens = 0;

  const task =
    kind === "nightly" ? NIGHTLY_TASK : kind === "weekly" ? WEEKLY_TASK : eventContext ?? "Investigate the triggering event and write a short event brief.";

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Workspace: ${workspaceId}\n\n${task}` },
  ];

  try {
    for (let i = 0; i < 14; i++) {
      const resp = await client.messages.create({
        model: env.agentModel(),
        max_tokens: 4096,
        system: ATLAS_SYSTEM_PROMPT,
        tools: AGENT_TOOLS as any,
        messages,
      });
      tokens += (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0);
      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          const out = await executeTool(db, workspaceId, block.name, block.input, briefIdRef);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(out).slice(0, 12000),
          });
        }
      }
      if (toolResults.length === 0) break;
      messages.push({ role: "user", content: toolResults });
    }

    let validation: { ok: boolean; problems: string[] } | undefined;
    if (kind === "weekly" && briefIdRef.id) {
      validation = await validateBrief(db, workspaceId, briefIdRef.id);
    }

    await db
      .from("agent_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: true,
        tokens,
        inputs: { kind, brief_id: briefIdRef.id, validation },
      })
      .eq("id", run?.id);

    return { ok: true, tokens, brief_id: briefIdRef.id, validation };
  } catch (e: any) {
    await db
      .from("agent_runs")
      .update({ finished_at: new Date().toISOString(), ok: false, tokens, error: e?.message ?? String(e) })
      .eq("id", run?.id);
    return { ok: false, error: e?.message ?? String(e), tokens };
  }
}

/** Run for every workspace (used by the cron routes). */
export async function runAgentAllWorkspaces(kind: "nightly" | "weekly") {
  const db = createServiceClient();
  const { data: workspaces } = await db.from("workspaces").select("id");
  const results = [];
  for (const ws of workspaces ?? []) {
    results.push({ workspace: ws.id, result: await runAgent(kind, ws.id) });
  }
  return results;
}
