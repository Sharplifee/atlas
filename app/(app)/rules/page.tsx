import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RuleToggles, ApproveRevert, ArmSwitch } from "@/components/RuleControls";
import { updateRuleParams } from "@/lib/actions/rules";
import { RULE_DEFS, ALL_RULE_KEYS } from "@/lib/rules/defaults";
import { STALENESS_MINUTES } from "@/lib/rules/invariants";
import { relTime } from "@/lib/format";
import type { Rule, RuleKey } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const isOwner = ctx.role === "owner";
  const shadow = (ctx.workspace.settings as any)?.atlas?.shadow !== false;

  const [{ data: rules }, { data: pending }] = await Promise.all([
    db.from("rules").select("*").eq("workspace_id", ctx.workspace.id),
    db
      .from("rule_events")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .eq("needs_approval", true)
      .is("approved_at", null)
      .is("reverted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const byKey = new Map<RuleKey, Rule>();
  for (const r of (rules as Rule[]) ?? []) byKey.set(r.key, r);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Rules</h1>
          <p className="text-2xs text-muted">
            Deterministic thresholds with hard invariants. No action fires on data
            older than {STALENESS_MINUTES} minutes; a rule may lower a daily cap
            but never raise one; every trigger writes an event.
          </p>
        </div>
      </div>

      <Card
        title="Engine mode"
        subtitle="New workspaces start in shadow — the engine records what it WOULD do and touches nothing"
      >
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {shadow ? (
              <span className="text-warn">Shadow mode — no spend is ever changed.</span>
            ) : (
              <span className="text-bad">Armed — enabled+armed rules execute reversibly.</span>
            )}
          </div>
          {isOwner ? (
            <ArmSwitch shadow={shadow} />
          ) : (
            <Badge tone="muted">owner only</Badge>
          )}
        </div>
      </Card>

      <Card title="Pending approval" subtitle="scale-gated changes never auto-execute">
        {(pending ?? []).length === 0 ? (
          <EmptyState title="Nothing queued" />
        ) : (
          <ul className="space-y-2">
            {(pending ?? []).map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <span>
                  <Badge tone="warn">{e.rule_key}</Badge> {e.action} on{" "}
                  <span className="tnum">{e.external_id}</span>
                  <span className="ml-2 text-2xs text-muted">
                    {JSON.stringify((e.detail as any)?.after ?? {})}
                  </span>
                </span>
                {ctx.role === "viewer" ? (
                  <span className="text-2xs text-muted">{relTime(e.created_at)}</span>
                ) : (
                  <ApproveRevert eventId={e.id} reverted={!!e.reverted_at} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ALL_RULE_KEYS.map((key) => {
          const def = RULE_DEFS[key];
          const rule = byKey.get(key);
          const params = (rule?.params as Record<string, number>) ?? def.defaults;
          return (
            <Card key={key} title={def.title} subtitle={def.action}>
              <p className="text-2xs text-fg-soft">{def.describe(params)}</p>

              <div className="mt-3 flex items-center justify-between">
                <RuleToggles
                  ruleKey={key}
                  enabled={rule?.enabled ?? true}
                  armed={rule?.armed ?? false}
                />
                {rule && (
                  <span className="text-2xs text-muted">
                    updated {relTime(rule.updated_at)}
                  </span>
                )}
              </div>

              {isOwner && (
                <form action={updateRuleParams} className="mt-3 border-t border-border pt-3">
                  <input type="hidden" name="key" value={key} />
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(params).map(([k, v]) => (
                      <label key={k} className="flex items-center justify-between gap-2 text-2xs">
                        <span className="text-muted">{k}</span>
                        <input
                          name={k}
                          defaultValue={v}
                          type="number"
                          step="any"
                          className="w-20 rounded border border-border bg-surface px-2 py-1 text-2xs tnum"
                        />
                      </label>
                    ))}
                  </div>
                  <button className="mt-2 rounded-md border border-border bg-surface-2 px-3 py-1 text-2xs text-fg-soft hover:text-fg">
                    Save thresholds
                  </button>
                </form>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
