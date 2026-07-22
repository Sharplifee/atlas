import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Area } from "@/components/charts/Area";
import { triggerSignalPull } from "@/lib/actions/competitors";
import { relTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const ctx = await requireMember("viewer");
  const db = await createClient();
  const canWrite = ctx.role !== "viewer";

  const { data: signals } = await db
    .from("signals")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .order("captured_at", { ascending: false })
    .limit(100);

  const latestByKey = new Map<string, any>();
  for (const s of signals ?? []) {
    const k = `${s.kind}:${s.key}`;
    if (!latestByKey.has(k)) latestByKey.set(k, s);
  }
  const rows = [...latestByKey.values()];
  const trends = rows.filter((s) => s.kind === "trend");
  const season = rows.find((s) => s.kind === "season");
  const weather = rows.filter((s) => s.kind === "weather");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Signals</h1>
          <p className="text-2xs text-muted">
            When demand rises, creative ships before the peak — not after. Every
            source is best-effort; a failed source never blocks a run.
          </p>
        </div>
        {canWrite && (
          <form action={triggerSignalPull}>
            <button className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-2xs text-fg-soft hover:text-fg">
              Pull now
            </button>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No signals captured yet"
          hint="Run a pull. Season is always available; trends and weather populate when configured and reachable."
        />
      ) : (
        <>
          {season && (
            <Card title="Season" subtitle="calendar demand — always available">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-fg">{season.value?.label}</div>
                  <div className="text-2xs text-muted">{relTime(season.captured_at)}</div>
                </div>
                <Badge
                  tone={
                    season.value?.demand === "peak"
                      ? "good"
                      : season.value?.demand === "building"
                        ? "warn"
                        : "muted"
                  }
                >
                  {season.value?.demand}
                </Badge>
              </div>
            </Card>
          )}

          <Card title="Search trends" subtitle="rising demand terms">
            {trends.length === 0 ? (
              <EmptyState
                title="No trend data"
                hint="Add search terms to workspace settings.signals.terms. Trends are best-effort and degrade to nothing rather than fabricating."
              />
            ) : (
              <div className="space-y-4">
                {trends.map((t) => (
                  <div key={t.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">{t.key}</span>
                      <Badge tone={Number(t.score) > 0 ? "good" : "bad"}>
                        slope {Number(t.score).toFixed(2)}
                      </Badge>
                    </div>
                    {Array.isArray(t.value?.series) && (
                      <Area
                        data={t.value.series.map((v: number, i: number) => ({
                          label: String(i),
                          value: v,
                        }))}
                        tone="accent"
                        formatY={(v) => String(Math.round(v))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {weather.length > 0 && (
            <Card title="Weather" subtitle="local forecast (NWS)">
              {weather.map((w) => (
                <div key={w.id} className="text-sm">
                  <div className="text-fg">{w.value?.label}</div>
                  <div className="text-2xs text-fg-soft">{w.value?.detail}</div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
