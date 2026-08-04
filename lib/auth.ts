import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import type { Member, Role, Workspace } from "@/lib/types";

export const ACTIVE_WS_COOKIE = "atlas_ws";

/**
 * Open-access (TEMPORARY): when ATLAS_OPEN_ACCESS is on, resolve a synthetic
 * owner context bound to a default workspace — no login required. The default
 * workspace is the one named/ided by ATLAS_OPEN_ACCESS_WS if set, otherwise the
 * oldest workspace in the database. Returns null only if no workspace exists.
 */
async function openAccessContext(): Promise<MemberContext | null> {
  const svc = createServiceClient();
  const preferred = opt_("ATLAS_OPEN_ACCESS_WS");
  let workspace: Workspace | null = null;

  if (preferred) {
    const { data } = await svc
      .from("workspaces")
      .select("*")
      .or(`id.eq.${preferred},name.eq.${preferred}`)
      .limit(1)
      .maybeSingle();
    workspace = (data as Workspace) ?? null;
  }
  if (!workspace) {
    const { data } = await svc
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    workspace = (data as Workspace) ?? null;
  }
  if (!workspace) return null;

  return {
    userId: "open-access",
    email: null,
    workspace,
    role: "owner",
  };
}

function opt_(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

const ROLE_RANK: Record<Role, number> = { viewer: 0, analyst: 1, owner: 2 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface MemberContext {
  userId: string;
  email: string | null;
  workspace: Workspace;
  role: Role;
}

/** The authenticated user, or null. Never throws. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** All workspaces the current user is a member of (RLS-scoped). */
export async function listMemberships(): Promise<
  { member: Member; workspace: Workspace }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("*, workspace:workspaces(*)")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data
    .filter((row: any) => row.workspace)
    .map((row: any) => ({
      member: row as Member,
      workspace: row.workspace as Workspace,
    }));
}

/**
 * Resolve the caller's active workspace membership.
 * Honors the `atlas_ws` cookie when it points at a workspace the user belongs
 * to; otherwise falls back to the first membership.
 */
export async function getActiveMembership(): Promise<MemberContext | null> {
  if (env.openAccess()) return openAccessContext();

  const user = await getUser();
  if (!user) return null;

  const memberships = await listMemberships();
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_WS_COOKIE)?.value;
  const chosen =
    memberships.find((m) => m.workspace.id === preferred) ?? memberships[0];

  return {
    userId: user.id,
    email: user.email ?? null,
    workspace: chosen.workspace,
    role: chosen.member.role,
  };
}

/**
 * Gate a server component or route handler.
 *  - No session  → redirect to /login
 *  - No workspace → redirect to /onboarding
 *  - Role below `minRole` → redirect to the dashboard (read-only users cannot
 *    reach write surfaces)
 */
export async function requireMember(minRole: Role = "viewer"): Promise<MemberContext> {
  // Open access (TEMPORARY): no session required; serve the default workspace.
  if (env.openAccess()) {
    const ctx = await openAccessContext();
    if (!ctx) redirect("/onboarding");
    return ctx;
  }

  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getActiveMembership();
  if (!ctx) redirect("/onboarding");

  if (!roleAtLeast(ctx.role, minRole)) redirect("/");
  return ctx;
}
