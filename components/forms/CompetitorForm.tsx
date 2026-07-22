"use client";

import { useActionState } from "react";
import { addCompetitorPage } from "@/lib/actions/competitors";
import type { ActionResult } from "@/lib/actions/auth";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent";

export function AddCompetitorForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    addCompetitorPage,
    undefined
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex-1">
        <label className="text-2xs text-muted">Page id</label>
        <input className={field} name="page_id" placeholder="demo_competitor_greenscape" required />
      </div>
      <div className="flex-1">
        <label className="text-2xs text-muted">Name (optional)</label>
        <input className={field} name="page_name" placeholder="GreenScape Lawn Co" />
      </div>
      <button
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Adding…" : "Track"}
      </button>
      {state && "error" in state ? (
        <p className="w-full text-2xs text-bad">{state.error}</p>
      ) : null}
    </form>
  );
}
