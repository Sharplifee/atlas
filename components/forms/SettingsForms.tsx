"use client";

import { useActionState } from "react";
import { connectAdAccount } from "@/lib/actions/accounts";
import type { ActionResult } from "@/lib/actions/auth";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent";

export function AdAccountForm({ mode }: { mode: "fixture" | "live" }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    connectAdAccount,
    undefined
  );
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-2xs text-muted">Platform</label>
          <select className={field} name="platform" defaultValue="meta">
            <option value="meta">Meta</option>
          </select>
        </div>
        <div>
          <label className="text-2xs text-muted">Account external id</label>
          <input className={field} name="external_id" placeholder="act_demo" required />
        </div>
      </div>
      <div>
        <label className="text-2xs text-muted">Display name</label>
        <input className={field} name="name" placeholder="Acme — Meta" />
      </div>
      <div>
        <label className="text-2xs text-muted">
          System User token {mode === "fixture" && "(optional in fixture mode)"}
        </label>
        <input
          className={field}
          name="token"
          type="password"
          placeholder={mode === "fixture" ? "leave blank to replay fixtures" : "EAAB…"}
          autoComplete="off"
        />
        <p className="mt-1 text-2xs text-muted">
          Stored AES-256-GCM encrypted at rest. Never shown again after saving.
        </p>
      </div>
      {state && "error" in state ? (
        <p className="text-2xs text-bad">{state.error}</p>
      ) : null}
      <button
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Connecting…" : "Connect ad account"}
      </button>
    </form>
  );
}
