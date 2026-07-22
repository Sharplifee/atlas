import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Refreshes the Supabase auth session on every request and keeps cookies in
 * sync. If Supabase env is not configured, the middleware no-ops so the app
 * still boots (pages then render their "not configured" state).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!env.isConfigured()) return response;

  const supabase = createServerClient(
    env.requireSupabaseUrl(),
    env.requireSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and the health endpoint.
    "/((?!_next/static|_next/image|favicon.ico|api/health).*)",
  ],
};
