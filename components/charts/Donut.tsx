/** Inline-SVG donut for allocation / share breakdowns. */
export function Donut({
  segments,
  size = 140,
}: {
  segments: { label: string; value: number; tone?: string }[];
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total <= 0) {
    return <div className="text-2xs text-muted">no allocation data</div>;
  }
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const palette = ["accent", "good", "warn", "bad", "hero"];

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90">
        {segments.map((s, i) => {
          const frac = Math.max(0, s.value) / total;
          const dash = frac * circumference;
          const tone = s.tone ?? palette[i % palette.length];
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={`rgb(var(--${tone}))`}
              strokeWidth={14}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="space-y-1">
        {segments.map((s, i) => {
          const tone = s.tone ?? palette[i % palette.length];
          return (
            <div key={i} className="flex items-center gap-2 text-2xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: `rgb(var(--${tone}))` }}
              />
              <span className="text-fg-soft">{s.label}</span>
              <span className="tnum text-muted">
                {Math.round((Math.max(0, s.value) / total) * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
