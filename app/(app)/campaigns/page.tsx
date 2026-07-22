import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { latestSnapshots, listCampaigns } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Table, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { money, ratio, num } from "@/lib/format";
import type { MetricSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const cur = ctx.workspace.currency;

  const [campaigns, snaps] = await Promise.all([
    listCampaigns(db, ctx.workspace.id),
    latestSnapshots(db, ctx.workspace.id, "campaign"),
  ]);
  const byExt = new Map<string, MetricSnapshot>();
  for (const s of snaps) if (s.campaign_external_id) byExt.set(s.campaign_external_id, s);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Campaigns</h1>
        <p className="text-2xs text-muted">
          Ranked by outcome truth. Cost-per-outcome is the number that matters.
        </p>
      </div>

      <Card>
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            hint="Campaigns are discovered automatically on the first metrics pull. Connect an ad account in Settings and run a pull."
          />
        ) : (
          <Table
            head={["Campaign", "Cost/outcome", "Cost/lead", "Target CPL", "ROAS", "Closed", "Status"]}
          >
            {campaigns.map((c) => {
              const s = byExt.get(c.external_id);
              const cplOver =
                s?.cost_per_lead != null &&
                c.target_cost_per_lead != null &&
                s.cost_per_lead > c.target_cost_per_lead;
              return (
                <tr key={c.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/campaigns/${c.id}`} className="text-fg hover:text-accent">
                      {c.name}
                    </Link>
                  </Td>
                  <Td mono className="text-hero">{money(s?.cost_per_outcome ?? null, cur)}</Td>
                  <Td mono className={cplOver ? "text-bad" : ""}>
                    {money(s?.cost_per_lead ?? null, cur)}
                  </Td>
                  <Td mono>{money(c.target_cost_per_lead, cur)}</Td>
                  <Td mono>{ratio(s?.roas ?? null)}</Td>
                  <Td mono>{num(s?.attributed_closed ?? null)}</Td>
                  <Td>
                    <Badge tone={c.status === "active" ? "good" : "warn"}>{c.status}</Badge>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
