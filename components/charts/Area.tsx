/** Inline-SVG area chart with a target reference line. Self-contained. */
export function Area({
  data,
  height = 160,
  tone = "accent",
  target,
  formatY = (v: number) => String(Math.round(v)),
}: {
  data: { label: string; value: number }[];
  height?: number;
  tone?: "accent" | "good" | "bad" | "warn" | "hero";
  target?: number | null;
  formatY?: (v: number) => string;
}) {
  if (!data || data.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-2xs text-muted">
        not enough data yet
      </div>
    );
  }
  const w = 640;
  const h = height;
  const pad = 24;
  const values = data.map((d) => d.value);
  const min = Math.min(...values, target ?? Infinity);
  const max = Math.max(...values, target ?? -Infinity);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const x = (i: number) => pad + i * stepX;
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const area = `${x(0)},${h - pad} ${line} ${x(data.length - 1)},${h - pad}`;
  const color = `rgb(var(--${tone}))`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      <polygon points={area} fill={color} fillOpacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {target != null && (
        <>
          <line
            x1={pad}
            x2={w - pad}
            y1={y(target)}
            y2={y(target)}
            stroke="rgb(var(--warn))"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <text
            x={w - pad}
            y={y(target) - 4}
            textAnchor="end"
            fontSize={10}
            fill="rgb(var(--warn))"
          >
            target {formatY(target)}
          </text>
        </>
      )}
      <text x={pad} y={14} fontSize={10} fill="rgb(var(--muted))">
        {formatY(max)}
      </text>
      <text x={pad} y={h - 6} fontSize={10} fill="rgb(var(--muted))">
        {formatY(min)}
      </text>
    </svg>
  );
}
