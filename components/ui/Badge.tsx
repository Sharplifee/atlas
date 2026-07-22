import { ReactNode } from "react";

type Tone = "default" | "good" | "warn" | "bad" | "accent" | "muted";

const tones: Record<Tone, string> = {
  default: "border-border bg-surface-2 text-fg-soft",
  good: "border-good/30 bg-good/10 text-good",
  warn: "border-warn/30 bg-warn/10 text-warn",
  bad: "border-bad/30 bg-bad/10 text-bad",
  accent: "border-accent/30 bg-accent/10 text-accent",
  muted: "border-border bg-transparent text-muted",
};

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
