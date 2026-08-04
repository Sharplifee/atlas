import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Request-scoped Supabase client bound to the user's session cookies.
 * Respects RLS — this is the client used for all user-facing reads/writes.
 * Next 15: cookies() is async.
 *
 * Open access (TEMPORARY): when ATLAS_OPEN_ACCESS is on there is no user
 * session, so RLS-scoped reads would return nothing. In that mode we hand back
 * the service-role client so ungated pages can still render data. Turn the flag
 * off to restore normal per-user, RLS-enforced access.
 */
export async function createClient() {
  if (env.openAccess()) return createServiceClient();

  const cookieStore = await cookies();

  return createServerClient(
    env.requireSupabaseUrl(),
    env.requireSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            );
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Session refresh is handled by middleware; safe to ignore here.
          }
        },
      },
    }
  );
}
