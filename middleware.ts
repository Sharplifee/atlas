import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { logEvent, newRequestId } from "@/lib/eventLog";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Refreshes the Supabase auth session on every request and keeps cookies in
 * sync. If Supabase env is not configured, the middleware no-ops so the app
 * still boots (pages then render their "not configured" state).
 */
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // Append-only event log: every request gets a row + a forwarded x-request-id.
  const requestId = request.headers.get("x-request-id") ?? newRequestId();
  request.headers.set("x-request-id", requestId);
  let response = NextResponse.next({ request });
  response.headers.set("x-request-id", requestId);
  const path = request.nextUrl.pathname;
  event.waitUntil(
    logEvent({
      event_type: "request",
      name: `${request.method} ${path}`,
      status: "ok",
      surface: "edge",
      request_id: requestId,
      http_method: request.method,
      http_path: path,
      actor_type: path.startsWith("/api/cron/") ? "cron" : "anon",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: request.headers.get("user-agent"),
      payload: { query: Object.fromEntries(request.nextUrl.searchParams), referer: request.headers.get("referer") },
    })
  );

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
          response.headers.set("x-request-id", requestId);
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
