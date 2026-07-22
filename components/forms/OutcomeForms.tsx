"use client";

import { useActionState, useState } from "react";
import Papa from "papaparse";
import {
  addManualOutcome,
  importCsvOutcomes,
  type CsvOutcomeRow,
} from "@/lib/actions/outcomes";
import type { ActionResult } from "@/lib/actions/auth";

const field =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent";

export function ManualOutcomeForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    addManualOutcome,
    undefined
  );
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-2xs text-muted">Stage</label>
          <select className={field} name="stage" defaultValue="closed">
            <option value="lead">lead</option>
            <option value="qualified">qualified</option>
            <option value="closed">closed</option>
            <option value="churned">churned</option>
          </select>
        </div>
        <div>
          <label className="text-2xs text-muted">Revenue (if closed)</label>
          <input className={field} name="value" type="number" step="0.01" placeholder="2400" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-2xs text-muted">Campaign external id</label>
          <input className={field} name="campaign_external_id" placeholder="act_demo_camp_spring" />
        </div>
        <div>
          <label className="text-2xs text-muted">Ad external id (optional)</label>
          <input className={field} name="ad_external_id" placeholder="…_ad_1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-2xs text-muted">Contact (email/phone — hashed)</label>
          <input className={field} name="contact" placeholder="jane@example.com" />
        </div>
        <div>
          <label className="text-2xs text-muted">Occurred at (optional)</label>
          <input className={field} name="occurred_at" type="datetime-local" />
        </div>
      </div>
      {state && "error" in state ? (
        <p className="text-2xs text-bad">{state.error}</p>
      ) : null}
      <button
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Adding…" : "Add outcome"}
      </button>
    </form>
  );
}

const FIELDS = [
  "stage",
  "value",
  "external_ref",
  "occurred_at",
  "click_id",
  "utm_campaign",
  "utm_content",
  "campaign_external_id",
  "ad_external_id",
  "contact",
] as const;

function guess(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, string> = {
    stage: "stage",
    status: "stage",
    value: "value",
    revenue: "value",
    amount: "value",
    id: "external_ref",
    externalref: "external_ref",
    dealid: "external_ref",
    date: "occurred_at",
    occurredat: "occurred_at",
    closedate: "occurred_at",
    clickid: "click_id",
    fbclid: "click_id",
    utmcampaign: "utm_campaign",
    utmcontent: "utm_content",
    campaign: "campaign_external_id",
    campaignid: "campaign_external_id",
    adid: "ad_external_id",
    email: "contact",
    phone: "contact",
    contact: "contact",
  };
  return map[h] ?? "";
}

export function CsvImporter() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hs = res.meta.fields ?? [];
        setHeaders(hs);
        setRows(res.data);
        const m: Record<string, string> = {};
        for (const h of hs) {
          const g = guess(h);
          if (g) m[g] = h;
        }
        setMapping(m);
        setResult(null);
      },
    });
  }

  async function submit() {
    setBusy(true);
    setResult(null);
    const mapped: CsvOutcomeRow[] = rows.map((r) => {
      const out: any = {};
      for (const f of FIELDS) {
        const col = mapping[f];
        if (col && r[col] != null && r[col] !== "") out[f] = r[col];
      }
      if (!out.stage) out.stage = "lead";
      return out;
    });
    try {
      const res = await importCsvOutcomes(mapped);
      setResult(`Imported ${res.accepted} · matched ${res.matched} · errors ${res.errors}`);
    } catch (e: any) {
      setResult(`Import failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input type="file" accept=".csv" onChange={onFile} className="text-2xs text-fg-soft" />
      {headers.length > 0 && (
        <>
          <div className="text-2xs text-muted">
            {rows.length} rows detected. Map your columns:
          </div>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f} className="flex items-center justify-between gap-2 text-2xs">
                <span className="text-fg-soft">{f}</span>
                <select
                  className="rounded border border-border bg-surface px-2 py-1 text-2xs"
                  value={mapping[f] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-60"
          >
            {busy ? "Importing…" : `Import ${rows.length} outcomes`}
          </button>
        </>
      )}
      {result && <p className="text-2xs text-good">{result}</p>}
    </div>
  );
}
