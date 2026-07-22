import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recentOutcomes } from "@/lib/queries";
import { Card } from "@/components/ui/Card";
import { Tile } from "@/components/ui/Tile";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Td } from "@/components/ui/Table";
import { ManualOutcomeForm, CsvImporter } from "@/components/forms/OutcomeForms";
import { money, num, pct, relTime } from "@/lib/format";
import { coverage } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const cur = ctx.workspace.currency;
  const canWrite = ctx.role === "owner" || ctx.role === "analyst";

  const [outcomes, { data: sources }] = await Promise.all([
    recentOutcomes(db, ctx.workspace.id, 500),
    db.from("outcome_sources").select("*").eq("workspace_id", ctx.workspace.id),
  ]);

  const total = outcomes.length;
  const matched = outcomes.filter((o) => o.matched_by !== "unmatched").length;
  const closed = outcomes.filter((o) => o.stage === "closed");
  let attrRev = 0;
  let unattrRev = 0;
  for (const o of closed) {
    if (o.matched_by === "unmatched") unattrRev += Number(o.value ?? 0);
    else attrRev += Number(o.value ?? 0);
  }
  const cov = coverage(attrRev, unattrRev);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Outcomes</h1>
        <p className="text-2xs text-muted">
          Real business results come <em>to</em> Atlas. It never reaches into your
          CRM. Unmatched revenue is surfaced honestly, never guessed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Match rate"
          value={total > 0 ? pct(matched / total) : "—"}
          sub={`${num(matched)}/${num(total)} attributed`}
          tone={total > 0 && matched / total < 0.6 ? "bad" : "default"}
        />
        <Tile label="Attributed revenue" tone="good" value={money(attrRev, cur)} />
        <Tile
          label="Unattributed revenue"
          tone={unattrRev > 0 ? "warn" : "default"}
          value={money(unattrRev, cur)}
        />
        <Tile label="Coverage" value={cov == null ? "—" : pct(cov)} />
      </div>

      <Card title="Sources">
        <div className="flex flex-wrap gap-2">
          {(sources ?? []).map((s) => (
            <span key={s.id} className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-2xs">
              <Badge tone="muted">{s.kind}</Badge> {s.name}{" "}
              <span className={s.active ? "text-good" : "text-warn"}>
                {s.active ? "active" : "inactive"}
              </span>
            </span>
          ))}
        </div>
      </Card>

      {canWrite && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Manual entry" subtitle="for low-volume, high-value businesses">
            <ManualOutcomeForm />
          </Card>
          <Card title="CSV import" subtitle="map your export columns to Atlas fields">
            <CsvImporter />
          </Card>
        </div>
      )}

      <Card title="Recent outcomes">
        {total === 0 ? (
          <EmptyState
            title="No outcomes yet"
            hint="POST to the webhook, import a CSV, or add one manually. Attribution runs the moment an outcome arrives."
          />
        ) : (
          <Table head={["When", "Stage", "Value", "Matched by", "Campaign", "Ad"]}>
            {outcomes.slice(0, 100).map((o) => (
              <tr key={o.id}>
                <Td className="text-2xs text-muted">{relTime(o.occurred_at)}</Td>
                <Td>
                  <Badge tone={o.stage === "closed" ? "good" : "muted"}>{o.stage}</Badge>
                </Td>
                <Td mono>{o.stage === "closed" ? money(o.value, cur) : "—"}</Td>
                <Td>
                  <Badge tone={o.matched_by === "unmatched" ? "warn" : "accent"}>
                    {o.matched_by}
                  </Badge>
                </Td>
                <Td className="text-2xs">{o.campaign_external_id ?? "—"}</Td>
                <Td className="text-2xs">{o.ad_external_id ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
