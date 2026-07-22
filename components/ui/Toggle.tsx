"use client";

import { useState, useTransition } from "react";

/**
 * Controlled switch that runs an async action on flip and reflects the result.
 * Optimistic, with rollback if the action throws.
 */
export function Toggle({
  checked,
  disabled = false,
  onChange,
  labelOn = "On",
  labelOff = "Off",
  toneOn = "accent",
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => Promise<void> | void;
  labelOn?: string;
  labelOff?: string;
  toneOn?: "accent" | "good" | "bad";
}) {
  const [on, setOn] = useState(checked);
  const [pending, start] = useTransition();

  const toneBg =
    toneOn === "good"
      ? "bg-good"
      : toneOn === "bad"
        ? "bg-bad"
        : "bg-accent";

  function flip() {
    if (disabled || pending) return;
    const next = !on;
    setOn(next);
    start(async () => {
      try {
        await onChange(next);
      } catch {
        setOn(!next); // rollback
      }
    });
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={disabled || pending}
      aria-pressed={on}
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          on ? toneBg : "bg-surface-2 border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            on ? "left-4" : "left-0.5"
          }`}
        />
      </span>
      <span className="text-2xs text-fg-soft">{on ? labelOn : labelOff}</span>
    </button>
  );
}
