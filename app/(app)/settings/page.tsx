import { requireMember, listMemberships } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { triggerMetricsPull } from "@/lib/actions/accounts";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdAccountForm } from "@/components/forms/SettingsForms";
import { env } from "@/lib/env";
import { relTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const isOwner = ctx.role === "owner";
  const mode = env.metaMode();

  const [{ data: accounts }, { data: sources }, memberships] = await Promise.all([
    db.from("ad_accounts").select("*").eq("workspace_id", ctx.workspace.id),
    db.from("outcome_sources").select("*").eq("workspace_id", ctx.workspace.id),
    listMemberships(),
  ]);

  const webhook = (sources ?? []).find((s) => s.kind === "webhook");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-2xs text-muted">
          Workspace, ad accounts, outcome sources, and members.
        </p>
      </div>

      <Card title="Workspace">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-2xs text-muted">Name</div>
            <div>{ctx.workspace.name}</div>
          </div>
          <div>
            <div className="text-2xs text-muted">Timezone</div>
            <div>{ctx.workspace.timezone}</div>
          </div>
          <div>
            <div className="text-2xs text-muted">Currency</div>
            <div>{ctx.workspace.currency}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone="muted">Meta mode: {mode}</Badge>
          {(ctx.workspace.settings as any)?.atlas?.shadow !== false ? (
            <Badge tone="warn">rules: shadow</Badge>
          ) : (
            <Badge tone="good">rules: armed</Badge>
          )}
        </div>
      </Card>

      <Card
        title="Ad accounts"
        subtitle="Metrics pull runs every 15 minutes for active accounts"
        action={
          <form action={triggerMetricsPull}>
            <button className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-2xs text-fg-soft hover:text-fg">
              Run pull now
            </button>
          </form>
        }
      >
        {(accounts ?? []).length === 0 ? (
          <EmptyState
            title="No ad accounts connected"
            hint={
              mode === "fixture"
                ? "In fixture mode you can connect any account id (e.g. act_demo) with no token — Atlas replays realistic data so you can test the whole pipeline."
                : "Connect a Meta account with a System User token to begin pulling metrics."
            }
          />
        ) : (
          <ul className="space-y-2">
            {(accounts ?? []).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <span>
                  <span className="tnum">{a.external_id}</span>{" "}
                  <span className="text-muted">· {a.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={a.access_token_encrypted ? "good" : "muted"}>
                    {a.access_token_encrypted ? "token stored" : "no token"}
                  </Badge>
                  <Badge tone={a.status === "active" ? "good" : "warn"}>
                    {a.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}

        {isOwner && (
          <div className="mt-4 border-t border-border pt-4">
            <AdAccountForm mode={mode} />
          </div>
        )}
      </Card>

      <Card
        title="Outcome sources"
        subtitle="How real business results reach Atlas — never the other way around"
      >
        <div className="space-y-2 text-sm">
          {(sources ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2"
            >
              <span>
                <Badge tone="muted">{s.kind}</Badge> {s.name}
              </span>
              <Badge tone={s.active ? "good" : "warn"}>
                {s.active ? "active" : "inactive"}
              </Badge>
            </div>
          ))}
        </div>
        {webhook && (
          <div className="mt-3 rounded-md border border-border bg-surface p-3 text-2xs">
            <div className="text-muted">Webhook endpoint</div>
            <code className="text-accent">POST {env.appUrl()}/api/ingest/outcomes</code>
            <div className="mt-2 text-muted">Header</div>
            <code className="break-all text-fg-soft">
              x-atlas-key: {isOwner ? webhook.secret : "•••••••• (owners only)"}
            </code>
          </div>
        )}
      </Card>

      <Card title="Members">
        <ul className="space-y-1 text-sm">
          {memberships.map(({ member }) => (
            <li key={member.id} className="flex items-center justify-between">
              <span className="text-fg-soft">
                {member.user_id === ctx.userId ? ctx.email : member.user_id}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone="muted">{member.role}</Badge>
                <span className="text-2xs text-muted">
                  {relTime(member.created_at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
