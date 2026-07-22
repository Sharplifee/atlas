import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Campaign,
  MetricSnapshot,
  Outcome,
  RuleEvent,
} from "@/lib/types";
import { coverage } from "@/lib/metrics";

/**
 * Read layer. All functions take an RLS-scoped client (from lib/supabase/server)
 * and a workspace id. They degrade to empty results rather than throwing, so
 * every page can render an honest empty state.
 */

type DB = SupabaseClient<any, any, any>;

/** Most recent snapshot per external_id at a given level. */
export async function latestSnapshots(
  db: DB,
  wsId: string,
  level: "campaign" | "ad" = "campaign",
  lookback = 800
): Promise<MetricSnapshot[]> {
  const { data } = await db
    .from("metric_snapshots")
    .select("*")
    .eq("workspace_id", wsId)
    .eq("level", level)
    .order("pulled_at", { ascending: false })
    .limit(lookback);
  if (!data) return [];
  const seen = new Set<string>();
  const out: MetricSnapshot[] = [];
  for (const row of data as MetricSnapshot[]) {
    if (seen.has(row.external_id)) continue;
    seen.add(row.external_id);
    out.push(row);
  }
  return out;
}

export async function listCampaigns(db: DB, wsId: string): Promise<Campaign[]> {
  const { data } = await db
    .from("campaigns")
    .select("*")
    .eq("workspace_id", wsId)
    .order("created_at", { ascending: false });
  return (data as Campaign[]) ?? [];
}

export async function snapshotSeries(
  db: DB,
  wsId: string,
  campaignExternalId: string,
  metric: keyof MetricSnapshot = "cost_per_outcome",
  points = 14
): Promise<{ label: string; value: number }[]> {
  const { data } = await db
    .from("metric_snapshots")
    .select("pulled_at, " + String(metric))
    .eq("workspace_id", wsId)
    .eq("campaign_external_id", campaignExternalId)
    .eq("level", "campaign")
    .order("pulled_at", { ascending: false })
    .limit(points);
  if (!data) return [];
  return (data as any[])
    .reverse()
    .filter((r) => r[metric] != null)
    .map((r) => ({ label: r.pulled_at, value: Number(r[metric]) }));
}

export async function recentOutcomes(
  db: DB,
  wsId: string,
  limit = 200
): Promise<Outcome[]> {
  const { data } = await db
    .from("outcomes")
    .select("*")
    .eq("workspace_id", wsId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return (data as Outcome[]) ?? [];
}

export async function pendingApprovals(
  db: DB,
  wsId: string
): Promise<RuleEvent[]> {
  const { data } = await db
    .from("rule_events")
    .select("*")
    .eq("workspace_id", wsId)
    .eq("needs_approval", true)
    .is("approved_at", null)
    .is("reverted_at", null)
    .order("created_at", { ascending: false });
  return (data as RuleEvent[]) ?? [];
}

export interface DashboardSummary {
  spend: number;
  attributedRevenue: number;
  unattributedRevenue: number;
  costPerOutcome: number | null;
  closed: number;
  leads: number;
  coverage: number | null;
  campaignCount: number;
  hasData: boolean;
}

export async function dashboardSummary(
  db: DB,
  wsId: string
): Promise<DashboardSummary> {
  const snaps = await latestSnapshots(db, wsId, "campaign");
  const outcomes = await recentOutcomes(db, wsId, 1000);

  let spend = 0;
  let closed = 0;
  let leads = 0;
  let attrRevenue = 0;
  for (const s of snaps) {
    spend += Number(s.spend ?? 0);
    closed += Number(s.attributed_closed ?? 0);
    leads += Number(s.attributed_leads ?? 0);
    attrRevenue += Number(s.attributed_revenue ?? 0);
  }

  // Unattributed revenue: closed outcomes the ladder could not attribute.
  let unattr = 0;
  for (const o of outcomes) {
    if (o.stage === "closed" && o.matched_by === "unmatched") {
      unattr += Number(o.value ?? 0);
    }
  }

  return {
    spend,
    attributedRevenue: attrRevenue,
    unattributedRevenue: unattr,
    costPerOutcome: closed > 0 ? spend / closed : null,
    closed,
    leads,
    coverage: coverage(attrRevenue, unattr),
    campaignCount: snaps.length,
    hasData: snaps.length > 0 || outcomes.length > 0,
  };
}
