import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { env } from "@/lib/env";
import { relTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();

  const { data: briefs } = await db
    .from("briefs")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Briefs</h1>
        <p className="text-2xs text-muted">
          Atlas is the only judgment in the system. It reads everything, proposes
          strategy and creative, and never touches money.
        </p>
      </div>

      {!env.agentEnabled() && (
        <div className="rounded-card border border-border bg-surface px-4 py-2 text-2xs text-muted">
          The Atlas agent is currently <span className="text-warn">disabled</span>.
          Set <code className="text-accent">ATLAS_AGENT_ENABLED=true</code> and{" "}
          <code className="text-accent">ANTHROPIC_API_KEY</code> to enable nightly
          and weekly briefs.
        </div>
      )}

      {(briefs ?? []).length === 0 ? (
        <EmptyState
          title="No briefs yet"
          hint="Once enabled, Atlas writes a nightly digest and a weekly synthesis. Every claim cites the rows behind it."
        />
      ) : (
        <div className="space-y-4">
          {(briefs ?? []).map((b) => (
            <Card
              key={b.id}
              title={<span className="capitalize">{b.kind} brief</span>}
              subtitle={`${relTime(b.created_at)} · ${
                Array.isArray(b.cited) ? b.cited.length : 0
              } cited rows · ${b.tokens ?? 0} tokens`}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm text-fg-soft">
                {b.body_md}
              </pre>
              {Array.isArray(b.cited) && b.cited.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
                  {b.cited.slice(0, 40).map((id: string) => (
                    <Badge key={id} tone="muted">
                      {String(id).slice(0, 10)}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
