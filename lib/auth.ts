import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member, Role, Workspace } from "@/lib/types";

export const ACTIVE_WS_COOKIE = "atlas_ws";

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
  const user = await getUser();
  if (!user) redirect("/login");

  const ctx = await getActiveMembership();
  if (!ctx) redirect("/onboarding");

  if (!roleAtLeast(ctx.role, minRole)) redirect("/");
  return ctx;
}
