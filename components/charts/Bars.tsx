import { num } from "@/lib/format";

/** Horizontal bars, ranked. Inline SVG-free (pure divs) for crisp text. */
export function Bars({
  data,
  tone = "accent",
  format = (v: number) => num(v),
}: {
  data: { label: string; value: number }[];
  tone?: "accent" | "good" | "bad" | "warn" | "hero";
  format?: (v: number) => string;
}) {
  if (!data || data.length === 0) {
    return <div className="text-2xs text-muted">no data</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const color = `rgb(var(--${tone}))`;
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-28 shrink-0 truncate text-2xs text-fg-soft" title={d.label}>
            {d.label}
          </div>
          <div className="relative h-4 flex-1 rounded bg-surface-2">
            <div
              className="h-4 rounded"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: color,
                opacity: 0.75,
              }}
            />
          </div>
          <div className="tnum w-16 shrink-0 text-right text-2xs text-fg">
            {format(d.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
