import { num, pct } from "@/lib/format";

/** Outcome funnel: lead → qualified → closed. Shows step conversion. */
export function Funnel({
  stages,
}: {
  stages: { label: string; value: number }[];
}) {
  if (!stages || stages.length === 0) {
    return <div className="text-2xs text-muted">no funnel data</div>;
  }
  const top = Math.max(stages[0]?.value ?? 0, 1);
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const width = (s.value / top) * 100;
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev && prev > 0 ? s.value / prev : null;
        return (
          <div key={s.label}>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-fg-soft">{s.label}</span>
              <span className="tnum text-fg">
                {num(s.value)}
                {conv != null && (
                  <span className="ml-2 text-muted">{pct(conv)}</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-6 rounded bg-surface-2">
              <div
                className="flex h-6 items-center rounded bg-accent/70 px-2"
                style={{ width: `${Math.max(width, 4)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
