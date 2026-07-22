import { createServiceClient } from "@/lib/supabase/service";
import { getTrendSignal } from "@/lib/signals/trends";
import { seasonSignal, getWeather } from "@/lib/signals/weather";

/**
 * Signals pipeline. Every source is best-effort: a failed source never blocks a
 * run. Season is always produced (calendar-based); trends and weather degrade to
 * nothing on failure rather than fabricating data.
 */
export interface SignalPullResult {
  workspaces: number;
  inserted: number;
  errors: string[];
}

export async function runSignalPull(opts?: {
  workspaceId?: string;
}): Promise<SignalPullResult> {
  const db = createServiceClient();
  const res: SignalPullResult = { workspaces: 0, inserted: 0, errors: [] };

  let q = db.from("workspaces").select("id, settings");
  if (opts?.workspaceId) q = q.eq("id", opts.workspaceId);
  const { data: workspaces } = await q;
  if (!workspaces) return res;

  const now = new Date();

  for (const ws of workspaces) {
    res.workspaces += 1;
    const settings = (ws.settings as any) ?? {};
    const cfg = settings.signals ?? {};
    const terms: string[] = Array.isArray(cfg.terms) ? cfg.terms : [];
    const geo = cfg.geo ?? null; // { lat, lon, label }

    const rows: any[] = [];

    // 1. Season — always available.
    const season = seasonSignal(now);
    rows.push({
      workspace_id: ws.id,
      kind: "season",
      key: `month_${season.month}`,
      value: season,
      score: season.score,
    });

    // 2. Trends — best effort per term.
    for (const term of terms.slice(0, 5)) {
      try {
        const t = await getTrendSignal(term);
        if (t) {
          rows.push({
            workspace_id: ws.id,
            kind: "trend",
            key: term,
            value: t,
            score: t.slope,
          });
        }
      } catch (e: any) {
        res.errors.push(`trend ${term}: ${e?.message ?? e}`);
      }
    }

    // 3. Weather — best effort.
    if (geo?.lat != null && geo?.lon != null) {
      try {
        const w = await getWeather(geo.lat, geo.lon);
        if (w) {
          rows.push({
            workspace_id: ws.id,
            kind: "weather",
            key: geo.label ?? "local",
            value: w,
            score: null,
          });
        }
      } catch (e: any) {
        res.errors.push(`weather: ${e?.message ?? e}`);
      }
    }

    if (rows.length > 0) {
      const { error } = await db.from("signals").insert(rows);
      if (error) res.errors.push(`${ws.id}: ${error.message}`);
      else res.inserted += rows.length;
    }
  }

  return res;
}
