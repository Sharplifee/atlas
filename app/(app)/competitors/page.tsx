import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddCompetitorForm } from "@/components/forms/CompetitorForm";
import { triggerCompetitorPull } from "@/lib/actions/competitors";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function runLength(started: string | null, lastSeen: string | null): number | null {
  if (!started) return null;
  const a = new Date(started).getTime();
  const b = lastSeen ? new Date(lastSeen).getTime() : Date.now();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400_000));
}

export default async function CompetitorsPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const canWrite = ctx.role !== "viewer";

  const [{ data: pages }, { data: ads }] = await Promise.all([
    db.from("competitor_pages").select("*").eq("workspace_id", ctx.workspace.id),
    db
      .from("competitor_ads")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .eq("active", true)
      .order("started_running", { ascending: true })
      .limit(200),
  ]);

  const weekAgo = Date.now() - 7 * 86400_000;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Competitors</h1>
        <p className="text-2xs text-muted">
          A competitor ad that has run for months is proven demand worth beating —
          not copying. Run-length is the signal.
        </p>
      </div>

      <Card
        title="Tracked pages"
        action={
          canWrite ? (
            <form action={triggerCompetitorPull}>
              <button className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-2xs text-fg-soft hover:text-fg">
                Pull now
              </button>
            </form>
          ) : null
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {(pages ?? []).length === 0 ? (
            <span className="text-2xs text-muted">No pages tracked yet.</span>
          ) : (
            (pages ?? []).map((p) => (
              <Badge key={p.id} tone="muted">
                {p.page_name ?? p.page_id}
              </Badge>
            ))
          )}
        </div>
        {canWrite && <AddCompetitorForm />}
      </Card>

      <Card title="Ad wall" subtitle="active competitor creatives, longest-running first">
        {(ads ?? []).length === 0 ? (
          <EmptyState
            title="No competitor ads yet"
            hint="Track a page and run a pull. In fixture mode, Atlas replays realistic competitor ads so you can see run-length badges."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(ads ?? []).map((a) => {
              const days = runLength(a.started_running, a.last_seen);
              const proven = days != null && days >= 90;
              const isNew =
                a.first_seen && new Date(a.first_seen).getTime() >= weekAgo;
              return (
                <div key={a.id} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs text-muted">{a.page_id}</span>
                    <div className="flex gap-1">
                      {isNew && <Badge tone="accent">new</Badge>}
                      {days != null && (
                        <Badge tone={proven ? "good" : "muted"}>{days}d running</Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-fg">{a.headline ?? "—"}</div>
                  <div className="mt-1 text-2xs text-fg-soft">{a.body ?? ""}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.offer_extracted && <Badge tone="warn">{a.offer_extracted}</Badge>}
                    {a.angle_extracted && <Badge tone="muted">{a.angle_extracted}</Badge>}
                    {a.format && <Badge tone="muted">{a.format}</Badge>}
                  </div>
                  <div className="mt-2 text-2xs text-muted">
                    since {shortDate(a.started_running)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
