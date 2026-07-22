import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { latestSnapshots, snapshotSeries } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Tile } from "@/components/ui/Tile";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Area } from "@/components/charts/Area";
import { Funnel } from "@/components/charts/Funnel";
import { money, ratio, num, relTime, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const cur = ctx.workspace.currency;

  const { data: campaign } = await db
    .from("campaigns")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .eq("id", id)
    .maybeSingle();
  if (!campaign) notFound();

  const snaps = await latestSnapshots(db, ctx.workspace.id, "campaign");
  const latest = snaps.find((s) => s.campaign_external_id === campaign.external_id);

  const [cpoSeries, cplSeries, { data: events }] = await Promise.all([
    snapshotSeries(db, ctx.workspace.id, campaign.external_id, "cost_per_outcome"),
    snapshotSeries(db, ctx.workspace.id, campaign.external_id, "cost_per_lead"),
    db
      .from("rule_events")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .eq("campaign_external_id", campaign.external_id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/campaigns" className="text-2xs text-muted hover:text-fg">
          ← Campaigns
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-lg font-semibold">{campaign.name}</h1>
          <Badge tone={campaign.status === "active" ? "good" : "warn"}>
            {campaign.status}
          </Badge>
        </div>
        <p className="text-2xs text-muted">{campaign.offer ?? "no offer set"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Cost / outcome" tone="hero" big value={money(latest?.cost_per_outcome ?? null, cur)} />
        <Tile label="Cost / lead" value={money(latest?.cost_per_lead ?? null, cur)} sub={`target ${money(campaign.target_cost_per_lead, cur)}`} />
        <Tile label="Spend" value={money(latest?.spend ?? null, cur)} sub={`cap ${money(campaign.daily_cap, cur)}`} />
        <Tile label="ROAS" tone="good" value={ratio(latest?.roas ?? null)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Cost per outcome" subtitle="lower is better">
          {cpoSeries.length < 2 ? (
            <EmptyState title="Not enough history yet" hint="Trend appears after a few pulls." />
          ) : (
            <Area
              data={cpoSeries.map((p) => ({ label: shortDate(p.label), value: p.value }))}
              tone="hero"
              target={campaign.target_cost_per_outcome}
              formatY={(v) => money(v, cur)}
            />
          )}
        </Card>

        <Card title="Outcome funnel" subtitle="attributed to this campaign">
          {latest ? (
            <Funnel
              stages={[
                { label: "Leads", value: latest.attributed_leads ?? 0 },
                { label: "Qualified", value: latest.attributed_qualified ?? 0 },
                { label: "Closed", value: latest.attributed_closed ?? 0 },
              ]}
            />
          ) : (
            <EmptyState title="No outcome data yet" />
          )}
        </Card>
      </div>

      <Card title="Rule history" subtitle="every action, shadowed or executed">
        {(events ?? []).length === 0 ? (
          <EmptyState title="No rule events" hint="The engine writes a row here whenever a rule triggers on this campaign." />
        ) : (
          <ul className="space-y-1 text-sm">
            {(events ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b border-border py-1.5">
                <span className="flex items-center gap-2">
                  <Badge tone={e.executed ? "bad" : e.needs_approval ? "warn" : "muted"}>
                    {e.rule_key}
                  </Badge>
                  <span className="text-fg-soft">{e.action}</span>
                  {e.needs_approval && <span className="text-2xs text-warn">needs approval</span>}
                  {e.reverted_at && <span className="text-2xs text-muted">reverted</span>}
                </span>
                <span className="text-2xs text-muted">{relTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
