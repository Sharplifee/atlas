/** Minimal inline-SVG sparkline. No external chart lib. */
export function Sparkline({
  data,
  width = 120,
  height = 28,
  tone = "accent",
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: "accent" | "good" | "bad" | "warn";
}) {
  if (!data || data.length < 2) {
    return <span className="text-2xs text-muted">—</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = `rgb(var(--${tone}))`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
