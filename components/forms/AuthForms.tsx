"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  signIn,
  signUp,
  createWorkspace,
  type ActionResult,
} from "@/lib/actions/auth";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent";
const btn =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-60";

function ErrorLine({ state }: { state: ActionResult }) {
  if (state && "error" in state) {
    return <p className="text-2xs text-bad">{state.error}</p>;
  }
  return null;
}

export function SignInForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    signIn,
    undefined
  );
  return (
    <form action={action} className="space-y-3">
      <input className={field} name="email" type="email" placeholder="Email" autoComplete="email" required />
      <input className={field} name="password" type="password" placeholder="Password" autoComplete="current-password" required />
      <ErrorLine state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-2xs text-muted">
        No account?{" "}
        <Link href="/signup" className="text-accent">
          Create one
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    signUp,
    undefined
  );
  return (
    <form action={action} className="space-y-3">
      <input className={field} name="email" type="email" placeholder="Email" autoComplete="email" required />
      <input className={field} name="password" type="password" placeholder="Password (min 8 characters)" autoComplete="new-password" required />
      <ErrorLine state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </button>
      <p className="text-center text-2xs text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function WorkspaceForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    createWorkspace,
    undefined
  );
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="text-2xs text-muted">Workspace name</label>
        <input className={field} name="name" placeholder="Acme Landscaping" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-2xs text-muted">Timezone</label>
          <input className={field} name="timezone" defaultValue="America/Denver" />
        </div>
        <div>
          <label className="text-2xs text-muted">Currency</label>
          <input className={field} name="currency" defaultValue="USD" />
        </div>
      </div>
      <ErrorLine state={state} />
      <button className={btn} disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
