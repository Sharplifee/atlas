import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Request-scoped Supabase client bound to the user's session cookies.
 * Respects RLS — this is the client used for all user-facing reads/writes.
 * Next 15: cookies() is async.
 */
export async function createClient() {
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
