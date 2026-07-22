import { ReactNode } from "react";

type Tone = "default" | "hero" | "good" | "warn" | "bad";

const toneClass: Record<Tone, string> = {
  default: "text-fg",
  hero: "text-hero",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};

/**
 * A single stat readout. `hero` is used for cost-per-outcome — the number that
 * dominates every screen it appears on.
 */
export function Tile({
  label,
  value,
  sub,
  tone = "default",
  big = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  big?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="text-2xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`tnum mt-1 font-semibold ${toneClass[tone]} ${
          big ? "text-3xl" : "text-2xl"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-2xs text-fg-soft">{sub}</div>}
    </div>
  );
}
