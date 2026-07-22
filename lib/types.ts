/**
 * Shared domain types for Atlas. These mirror the database schema in
 * supabase/migrations/001_atlas_core.sql. They are intentionally hand-written
 * (rather than generated) so the app has a stable contract even before a live
 * database exists.
 */

export type Role = "owner" | "analyst" | "viewer";

export type Platform = "meta" | "google" | "tiktok";

export interface WorkspaceSettings {
  atlas?: {
    enabled?: boolean;
    shadow?: boolean;
    rails_locked?: boolean;
  };
  [key: string]: unknown;
}

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  settings: WorkspaceSettings;
  created_at: string;
}

export interface Member {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export interface AdAccount {
  id: string;
  workspace_id: string;
  platform: Platform;
  external_id: string;
  name: string | null;
  token_expires_at: string | null;
  status: "active" | "needs_reauth" | "disabled";
  created_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  external_id: string;
  name: string;
  objective: string | null;
  offer: string | null;
  geo: string[];
  target_cost_per_lead: number | null;
  target_cost_per_outcome: number | null;
  daily_cap: number | null;
  status: "active" | "paused" | "archived";
  created_at: string;
}

export type MetricLevel = "campaign" | "adset" | "ad";

export interface MetricSnapshot {
  id: number;
  workspace_id: string;
  ad_account_id: string;
  pulled_at: string;
  level: MetricLevel;
  external_id: string;
  campaign_external_id: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  link_clicks: number | null;
  platform_conversions: number | null;
  attributed_leads: number | null;
  attributed_qualified: number | null;
  attributed_closed: number | null;
  attributed_revenue: number | null;
  cost_per_lead: number | null;
  cost_per_outcome: number | null;
  roas: number | null;
  signal_quality: number | null;
  raw: unknown;
}

export type OutcomeStage = "lead" | "qualified" | "closed" | "churned";
export type MatchedBy = "click_id" | "utm" | "manual" | "unmatched";

export interface OutcomeSource {
  id: string;
  workspace_id: string;
  kind: "webhook" | "csv" | "manual" | "connector";
  name: string;
  secret: string | null;
  active: boolean;
  created_at: string;
}

export interface Outcome {
  id: string;
  workspace_id: string;
  source_id: string | null;
  external_ref: string | null;
  occurred_at: string;
  stage: OutcomeStage;
  value: number | null;
  click_id: string | null;
  utm: Record<string, string> | null;
  campaign_external_id: string | null;
  ad_external_id: string | null;
  contact_hash: string | null;
  matched_by: MatchedBy | null;
  raw: unknown;
  created_at: string;
}

export type RuleKey =
  | "kill_cpl"
  | "kill_zero"
  | "kill_cpo"
  | "fatigue"
  | "scale_step"
  | "scale_gate"
  | "drift_ctr"
  | "drift_signal";

export interface Rule {
  id: string;
  workspace_id: string;
  key: RuleKey;
  enabled: boolean;
  armed: boolean; // false = shadow mode
  params: Record<string, number>;
  updated_at: string;
}

export type RuleAction =
  | "pause"
  | "budget_change"
  | "flag"
  | "shadow_pause"
  | "shadow_scale";

export interface RuleEvent {
  id: string;
  workspace_id: string;
  created_at: string;
  rule_key: RuleKey;
  level: MetricLevel | null;
  external_id: string | null;
  campaign_external_id: string | null;
  action: RuleAction;
  detail: Record<string, unknown>;
  executed: boolean;
  needs_approval: boolean;
  approved_at: string | null;
  approved_by: string | null;
  reverted_at: string | null;
}

export interface CompetitorPage {
  id: string;
  workspace_id: string;
  platform: Platform;
  page_id: string;
  page_name: string | null;
  notes: string | null;
  active: boolean;
}

export interface CompetitorAd {
  id: string;
  workspace_id: string;
  page_id: string;
  archive_id: string;
  first_seen: string | null;
  last_seen: string | null;
  started_running: string | null;
  format: string | null;
  body: string | null;
  headline: string | null;
  cta: string | null;
  offer_extracted: string | null;
  angle_extracted: string | null;
  creative_hash: string | null;
  platforms: string[];
  active: boolean;
  raw: unknown;
}

export interface Signal {
  id: string;
  workspace_id: string;
  captured_at: string;
  kind: "trend" | "weather" | "season" | "platform" | "local";
  key: string;
  value: unknown;
  score: number | null;
}

export interface Brief {
  id: string;
  workspace_id: string;
  created_at: string;
  kind: "nightly" | "weekly" | "event";
  body_md: string;
  cited: unknown;
  tokens: number | null;
}

export interface CreativeSlot {
  id: string;
  workspace_id: string;
  slot_date: string;
  campaign_hint: string | null;
  geo: string | null;
  format: string | null;
  hook: string;
  copy_draft: string | null;
  visual_brief: string | null;
  offer: string | null;
  intent: string | null;
  status: "proposed" | "approved" | "edited" | "rejected" | "shipped";
  brief_id: string | null;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  workspace_id: string;
  started_at: string;
  finished_at: string | null;
  kind: string;
  ok: boolean | null;
  tokens: number | null;
  error: string | null;
  inputs: unknown;
}
