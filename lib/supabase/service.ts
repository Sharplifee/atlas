import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * Use ONLY in trusted server contexts that are not a user request:
 *   - cron pull routes (/api/pull/*), authenticated by CRON_SECRET
 *   - the outcome webhook (/api/ingest/outcomes), authenticated by x-atlas-key
 *   - the rule engine and agent runners
 *
 * NEVER import this into a client component or a user-session request path.
 */
export function createServiceClient() {
  return createSupabaseClient(
    env.requireSupabaseUrl(),
    env.requireServiceRoleKey(),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
