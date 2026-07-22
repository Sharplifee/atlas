import { ReactNode } from "react";

export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`rounded-card border border-border bg-surface ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && (
              <h3 className="text-sm font-medium text-fg">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-2xs text-muted">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
