/** Shown when Supabase env is absent, so the app boots instead of crashing. */
export function NotConfigured() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="text-lg font-semibold text-fg">Atlas isn&apos;t configured yet</div>
      <p className="mt-2 text-sm text-fg-soft">
        Set <code className="text-accent">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="text-accent">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (plus{" "}
        <code className="text-accent">SUPABASE_SERVICE_ROLE_KEY</code> for cron
        and ingestion) in your environment, then restart.
      </p>
      <p className="mt-3 text-2xs text-muted">
        See <code>.env.example</code> and the README for first-run setup.
      </p>
    </div>
  );
}
