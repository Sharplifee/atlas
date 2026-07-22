"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WS_COOKIE } from "@/lib/auth";

export type ActionResult = { error: string } | void;

export async function signIn(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signUp(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8)
    return { error: "Enter an email and a password of at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  // If email confirmation is disabled a session exists immediately.
  if (data.session) redirect("/onboarding");
  redirect("/login?check_email=1");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createWorkspace(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const timezone =
    String(formData.get("timezone") ?? "").trim() || "America/Denver";
  const currency =
    String(formData.get("currency") ?? "").trim() || "USD";
  if (!name) return { error: "Give your workspace a name." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("atlas_create_workspace", {
    p_name: name,
    p_timezone: timezone,
    p_currency: currency,
  });
  if (error) return { error: error.message };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WS_COOKIE, String(data), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });
  redirect("/");
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WS_COOKIE, workspaceId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });
  redirect("/");
}
