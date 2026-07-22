import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Browser Supabase client for client components (login/signup forms).
 * Respects RLS via the anon key.
 */
export function createClient() {
  return createBrowserClient(
    env.requireSupabaseUrl(),
    env.requireSupabaseAnonKey()
  );
}
