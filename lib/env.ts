/**
 * Centralized environment access. All reads are lazy and NON-throwing at import
 * time so that `next build` succeeds without a populated environment. Callers
 * that genuinely need a value at runtime use the `require*` helpers, which throw
 * a clear error only when actually invoked.
 */

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function req(name: string): string {
  const v = opt(name);
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`
    );
  }
  return v;
}

export const env = {
  // Supabase — public
  supabaseUrl: () => opt("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => opt("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  requireSupabaseUrl: () => req("NEXT_PUBLIC_SUPABASE_URL"),
  requireSupabaseAnonKey: () => req("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  // Supabase — server only
  requireServiceRoleKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),

  // Anthropic / agent
  anthropicKey: () => opt("ANTHROPIC_API_KEY"),
  agentEnabled: () => opt("ATLAS_AGENT_ENABLED") === "true",
  agentModel: () => opt("ATLAS_AGENT_MODEL") ?? "claude-sonnet-4-6",

  // Cron / automation
  requireCronSecret: () => req("CRON_SECRET"),
  cronSecret: () => opt("CRON_SECRET"),

  // Encryption
  requireEncryptionKey: () => req("ENCRYPTION_KEY"),
  encryptionKey: () => opt("ENCRYPTION_KEY"),

  // Meta
  metaApiVersion: () => opt("META_API_VERSION") ?? "v21.0",
  metaMode: (): "fixture" | "live" =>
    opt("META_MODE") === "live" ? "live" : "fixture",

  // App
  appUrl: () => opt("APP_URL") ?? "http://localhost:3000",

  // True only when the minimum Supabase config is present. Pages use this to
  // render a graceful "not configured" state instead of crashing.
  isConfigured: () =>
    !!opt("NEXT_PUBLIC_SUPABASE_URL") && !!opt("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};
