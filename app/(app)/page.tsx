import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  dashboardSummary,
  latestSnapshots,
  pendingApprovals,
} from "@/lib/queries";
import { Tile } from "@/components/ui/Tile";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkline } from "@/components/charts/Sparkline";
import { money, num, pct, ratio, relTime } from "@/lib/format";
import { DEFAULT_COVERAGE_FLOOR } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const cur = ctx.workspace.currency;

  const [summary, snaps, approvals] = await Promise.all([
    dashboardSummary(db, ctx.workspace.id),
    latestSnapshots(db, ctx.workspace.id, "campaign"),
    pendingApprovals(db, ctx.workspace.id),
  ]);

  const coverageLow =
    summary.coverage != null && summary.coverage < DEFAULT_COVERAGE_FLOOR;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-2xs text-muted">
            Judged on cost per closed outcome — not clicks, not platform
            conversions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Cost / outcome"
          tone="hero"
          big
          value={money(summary.costPerOutcome, cur)}
          sub={`${num(summary.closed)} closed`}
        />
        <Tile label="Spend" value={money(summary.spend, cur)} sub="latest pull" />
        <Tile
          label="Attributed revenue"
          tone="good"
          value={money(summary.attributedRevenue, cur)}
          sub={`ROAS ${ratio(
            summary.spend > 0
              ? summary.attributedRevenue / summary.spend
              : null
          )}`}
        />
        <Tile
          label="Attribution coverage"
          tone={coverageLow ? "bad" : "default"}
          value={summary.coverage == null ? "—" : pct(summary.coverage)}
          sub={
            summary.unattributedRevenue > 0
              ? `${money(summary.unattributedRevenue, cur)} unattributed`
              : "no unattributed revenue"
          }
        />
      </div>

      {coverageLow && (
        <div className="rounded-card border border-bad/30 bg-bad/10 px-4 py-2 text-2xs text-bad">
          Attribution coverage is below the {pct(DEFAULT_COVERAGE_FLOOR)} floor.
          Outcome-based rules (kill_cpo) auto-suspend and Atlas lowers its
          confidence until coverage recovers.
        </div>
      )}

      <Card
        title="Pending approval"
        subtitle="Actions the rule engine queued but will never take on its own"
      >
        {approvals.length === 0 ? (
          <EmptyState
            title="Nothing waiting on you"
            hint="Budget moves beyond the rails, or anything the scale gate flags, will appear here for a human decision."
          />
        ) : (
          <ul className="space-y-2">
            {approvals.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <span>
                  <Badge tone="warn">{a.rule_key}</Badge>{" "}
                  <span className="text-fg-soft">{a.action}</span> on{" "}
                  <span className="tnum">{a.external_id}</span>
                </span>
                <span className="text-2xs text-muted">
                  {relTime(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Campaigns" subtitle="Latest snapshot per campaign">
        {snaps.length === 0 ? (
          <EmptyState
            title="No campaign data yet"
            hint="Connect an ad account in Settings, then Atlas pulls metrics every 15 minutes. In fixture mode you can test the full pipeline with no live credentials."
            action={
              <Link
                href="/settings"
                className="rounded-md bg-accent px-3 py-1.5 text-2xs font-medium text-bg"
              >
                Connect an ad account
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {snaps.map((s) => (
              <div
                key={s.external_id}
                className="rounded-md border border-border bg-surface-2 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="truncate text-sm text-fg">
                    {s.campaign_external_id ?? s.external_id}
                  </div>
                  <Badge tone="muted">{relTime(s.pulled_at)}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-2xs">
                  <div>
                    <div className="text-muted">Cost/outcome</div>
                    <div className="tnum text-hero">
                      {money(s.cost_per_outcome, cur)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Spend</div>
                    <div className="tnum">{money(s.spend, cur)}</div>
                  </div>
                  <div>
                    <div className="text-muted">ROAS</div>
                    <div className="tnum">{ratio(s.roas)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
