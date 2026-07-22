import { ReactNode } from "react";

/**
 * Explicit empty state. Atlas NEVER renders a decorative placeholder chart —
 * where there is no data, it says so plainly.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface/40 px-6 py-10 text-center">
      <div className="text-sm font-medium text-fg-soft">{title}</div>
      {hint && <div className="mt-1 max-w-md text-2xs text-muted">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
