-- ============================================================================
-- Atlas core schema — migration 001
-- Standalone. No dependency on any other project's schema, data, or auth.
-- Multi-tenant: everything scoped by workspace_id, RLS = "member of workspace".
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- Tenancy
-- ============================================================================
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Denver',
  currency text not null default 'USD',
  settings jsonb not null default '{"atlas":{"enabled":true,"shadow":true,"rails_locked":true}}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,                 -- supabase auth.users id
  role text not null default 'viewer',   -- owner | analyst | viewer
  created_at timestamptz default now(),
  unique (workspace_id, user_id)
);
create index if not exists members_user_idx on members (user_id);

-- ============================================================================
-- Connected ad accounts
-- ============================================================================
create table if not exists ad_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform text not null default 'meta',      -- meta | google | tiktok (future)
  external_id text not null,                  -- e.g. act_123456
  name text,
  access_token_encrypted text,                -- AES-GCM with ENCRYPTION_KEY
  token_expires_at timestamptz,
  status text not null default 'active',      -- active | needs_reauth | disabled
  created_at timestamptz default now(),
  unique (workspace_id, platform, external_id)
);

-- ============================================================================
-- Campaign semantic layer
-- ============================================================================
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  external_id text not null,
  name text not null,
  objective text,
  offer text,
  geo text[] default '{}',
  target_cost_per_lead numeric,
  target_cost_per_outcome numeric,
  daily_cap numeric,
  status text not null default 'active',
  created_at timestamptz default now(),
  unique (ad_account_id, external_id)
);

-- ============================================================================
-- Metric snapshots
-- ============================================================================
create table if not exists metric_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  pulled_at timestamptz not null default now(),
  level text not null,                        -- campaign | adset | ad
  external_id text not null,
  campaign_external_id text,
  spend numeric, impressions bigint, reach bigint, frequency numeric,
  ctr numeric, cpc numeric, cpm numeric, link_clicks bigint,
  platform_conversions int,
  attributed_leads int, attributed_qualified int, attributed_closed int,
  attributed_revenue numeric,
  cost_per_lead numeric, cost_per_outcome numeric, roas numeric,
  signal_quality numeric,
  raw jsonb
);
create index if not exists metric_snapshots_ext_idx
  on metric_snapshots (external_id, pulled_at desc);
create index if not exists metric_snapshots_ws_campaign_idx
  on metric_snapshots (workspace_id, campaign_external_id, pulled_at desc);

-- ============================================================================
-- Outcome ingestion (source-agnostic)
-- ============================================================================
create table if not exists outcome_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null,                         -- webhook | csv | manual | connector
  name text not null,
  secret text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists outcomes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_id uuid references outcome_sources(id) on delete set null,
  external_ref text,
  occurred_at timestamptz not null,
  stage text not null,                        -- lead | qualified | closed | churned
  value numeric,
  click_id text,
  utm jsonb,
  campaign_external_id text,
  ad_external_id text,
  contact_hash text,
  matched_by text,                            -- click_id | utm | manual | unmatched
  raw jsonb,
  created_at timestamptz default now(),
  unique (workspace_id, source_id, external_ref)
);
create index if not exists outcomes_ws_time_idx
  on outcomes (workspace_id, occurred_at desc);
create index if not exists outcomes_ws_campaign_stage_idx
  on outcomes (workspace_id, campaign_external_id, stage);
create index if not exists outcomes_contact_hash_idx
  on outcomes (workspace_id, contact_hash);

-- ============================================================================
-- Rules
-- ============================================================================
create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key text not null,
  enabled boolean not null default true,
  armed boolean not null default false,       -- false = shadow mode
  params jsonb not null,
  updated_at timestamptz default now(),
  unique (workspace_id, key)
);

create table if not exists rule_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_at timestamptz default now(),
  rule_key text not null,
  level text, external_id text, campaign_external_id text,
  action text not null,                       -- pause | budget_change | flag | shadow_pause | shadow_scale
  detail jsonb not null,
  executed boolean not null default false,
  needs_approval boolean not null default false,
  approved_at timestamptz, approved_by uuid,
  reverted_at timestamptz
);
create index if not exists rule_events_ws_time_idx
  on rule_events (workspace_id, created_at desc);

-- ============================================================================
-- Competitor watch
-- ============================================================================
create table if not exists competitor_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform text not null default 'meta',
  page_id text not null, page_name text, notes text,
  active boolean default true,
  unique (workspace_id, platform, page_id)
);

create table if not exists competitor_ads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  page_id text not null,
  archive_id text not null,
  first_seen date, last_seen date, started_running date,
  format text, body text, headline text, cta text,
  offer_extracted text, angle_extracted text,
  creative_hash text, platforms text[], active boolean default true,
  raw jsonb,
  unique (workspace_id, archive_id)
);
create index if not exists competitor_ads_ws_page_active_idx
  on competitor_ads (workspace_id, page_id, active);

-- ============================================================================
-- Market signals
-- ============================================================================
create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  captured_at timestamptz default now(),
  kind text not null,                         -- trend | weather | season | platform | local
  key text not null,
  value jsonb not null,
  score numeric
);
create index if not exists signals_ws_kind_time_idx
  on signals (workspace_id, kind, captured_at desc);

-- ============================================================================
-- Agent outputs
-- ============================================================================
create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_at timestamptz default now(),
  kind text not null,                         -- nightly | weekly | event
  body_md text not null,
  cited jsonb,
  tokens int
);
create index if not exists briefs_ws_time_idx
  on briefs (workspace_id, created_at desc);

create table if not exists creative_slots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  slot_date date not null,
  campaign_hint text, geo text, format text,
  hook text not null, copy_draft text, visual_brief text, offer text, intent text,
  status text not null default 'proposed',    -- proposed | approved | edited | rejected | shipped
  brief_id uuid references briefs(id) on delete set null,
  updated_at timestamptz default now()
);
create index if not exists creative_slots_ws_date_idx
  on creative_slots (workspace_id, slot_date);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  started_at timestamptz default now(), finished_at timestamptz,
  kind text not null, ok boolean, tokens int, error text, inputs jsonb
);
create index if not exists agent_runs_ws_time_idx
  on agent_runs (workspace_id, started_at desc);

-- ============================================================================
-- Membership helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================================
create or replace function atlas_is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members m where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function atlas_can_write(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.role in ('owner','analyst')
  );
$$;

create or replace function atlas_is_owner(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- ============================================================================
-- Onboarding: create a workspace, its owner membership, default rules, and a
-- default webhook outcome source — atomically, bypassing the chicken-and-egg
-- of "must be a member to see the workspace you just created".
-- ============================================================================
create or replace function atlas_create_workspace(
  p_name text,
  p_timezone text default 'America/Denver',
  p_currency text default 'USD'
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into workspaces (name, timezone, currency)
  values (coalesce(nullif(trim(p_name), ''), 'My Workspace'), p_timezone, p_currency)
  returning id into v_ws;

  insert into members (workspace_id, user_id, role)
  values (v_ws, v_uid, 'owner');

  -- Seed the eight rules, all in shadow mode (armed = false).
  insert into rules (workspace_id, key, enabled, armed, params) values
    (v_ws, 'kill_cpl',    true, false, '{"cpl_multiple":2,"spend_multiple":1.5,"window_hours":72}'::jsonb),
    (v_ws, 'kill_zero',   true, false, '{"spend_multiple":3,"window_hours":72}'::jsonb),
    (v_ws, 'kill_cpo',    true, false, '{"cpo_multiple":3,"min_outcome_days":2,"window_days":7}'::jsonb),
    (v_ws, 'fatigue',     true, false, '{"frequency_max":3.5,"ctr_pct_of_peak":0.7}'::jsonb),
    (v_ws, 'scale_step',  true, false, '{"step_pct":0.20,"max_step_hours":72}'::jsonb),
    (v_ws, 'scale_gate',  true, false, '{"max_auto_pct":0.20}'::jsonb),
    (v_ws, 'drift_ctr',   true, false, '{"slope_days":3}'::jsonb),
    (v_ws, 'drift_signal',true, false, '{"drop_threshold":1.0}'::jsonb);

  -- Default webhook source so /api/ingest/outcomes works immediately.
  insert into outcome_sources (workspace_id, kind, name, secret)
  values (v_ws, 'webhook', 'Primary webhook', encode(extensions.gen_random_bytes(24), 'hex'));

  return v_ws;
end;
$$;

grant execute on function atlas_create_workspace(text, text, text) to authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table workspaces        enable row level security;
alter table members           enable row level security;
alter table ad_accounts       enable row level security;
alter table campaigns         enable row level security;
alter table metric_snapshots  enable row level security;
alter table outcome_sources   enable row level security;
alter table outcomes          enable row level security;
alter table rules             enable row level security;
alter table rule_events       enable row level security;
alter table competitor_pages  enable row level security;
alter table competitor_ads    enable row level security;
alter table signals           enable row level security;
alter table briefs            enable row level security;
alter table creative_slots    enable row level security;
alter table agent_runs        enable row level security;

-- workspaces: members read; owners update; anyone authenticated may create
-- (creation normally goes through atlas_create_workspace).
create policy ws_select on workspaces for select using (atlas_is_member(id));
create policy ws_update on workspaces for update using (atlas_is_owner(id)) with check (atlas_is_owner(id));

-- members: members of the workspace can see co-members; owners manage.
create policy members_select on members for select using (atlas_is_member(workspace_id));
create policy members_insert on members for insert with check (atlas_is_owner(workspace_id));
create policy members_update on members for update using (atlas_is_owner(workspace_id)) with check (atlas_is_owner(workspace_id));
create policy members_delete on members for delete using (atlas_is_owner(workspace_id));

-- Generic child-table policy pattern: members read, owner/analyst write.
do $$
declare t text;
begin
  foreach t in array array[
    'ad_accounts','campaigns','metric_snapshots','outcome_sources','outcomes',
    'rules','rule_events','competitor_pages','competitor_ads','signals',
    'briefs','creative_slots','agent_runs'
  ] loop
    execute format(
      'create policy %I_select on %I for select using (atlas_is_member(workspace_id));', t, t);
    execute format(
      'create policy %I_insert on %I for insert with check (atlas_can_write(workspace_id));', t, t);
    execute format(
      'create policy %I_update on %I for update using (atlas_can_write(workspace_id)) with check (atlas_can_write(workspace_id));', t, t);
    execute format(
      'create policy %I_delete on %I for delete using (atlas_can_write(workspace_id));', t, t);
  end loop;
end $$;

-- Note: the service-role key (used by cron pulls, the outcome webhook, the rule
-- engine, and the agent runner) bypasses RLS entirely. All user-facing access
-- goes through the anon key and is fully constrained by the policies above.
