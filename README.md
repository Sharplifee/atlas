# Atlas

**Standalone advertising intelligence.** Atlas watches ad accounts continuously,
judges performance against **real business outcomes** rather than platform-reported
vanity metrics, enforces spend discipline through a deterministic rule engine,
watches competitors, reads demand signals, and produces a strategist's brief plus
a creative calendar on a schedule.

The thesis: ad platforms optimize for events they can see (clicks, form fills,
pixel conversions). Those events are not money. Atlas ingests **downstream
outcomes** — the deal that closed, the revenue collected — attributes them back to
the ad that produced them, and judges every campaign on **cost per closed outcome**
and **return on collected revenue**.

> Atlas is entirely standalone. Its own repo, database, auth, deployment, and
> design system. It does not read from or write to any other product. Real
> business results reach it only through the generic outcome-ingestion layer.

---

## Three layers, strictly separated

1. **Monitors** — scheduled code. Deterministic, identical every run. No judgment.
2. **Rule engine** — deterministic thresholds with hard invariants. Guardrailed,
   logged, reversible, **shadow-mode by default**. Arithmetic only, no judgment.
3. **Atlas (the agent)** — the only judgment in the system. Reads everything,
   proposes strategy and creative, **never touches money**.

A human approves anything that moves a dollar beyond the rails.

---

## Stack

- Next.js 15 (App Router) + TypeScript, server components by default
- Tailwind + CSS-variable design tokens (`app/globals.css`)
- Supabase (Postgres + RLS + Auth)
- Anthropic API (`claude-sonnet-4-6`) for the agent — **off by default**
- Meta Marketing API + Ad Library — with a **fixture/replay mode** so the whole
  pipeline is testable with zero live credentials

---

## First run

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill in values
```

### 2. Create a Supabase project and apply the migration

Create a **new** Supabase project (do not reuse another product's). Then either:

```bash
# via psql
DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" \
  ./scripts/apply-migration.sh
```

or paste `supabase/migrations/001_atlas_core.sql` into the Supabase SQL editor.

This installs 15 tables, RLS on every one, the membership helper functions, and
`atlas_create_workspace()` (which seeds the eight rules in shadow mode and a
default webhook outcome source).

### 3. Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + RLS access |
| `SUPABASE_SERVICE_ROLE_KEY` | cron pulls, webhook ingest, rule engine, agent |
| `CRON_SECRET` | auth for `/api/pull/*` and `/api/agent/*` |
| `ENCRYPTION_KEY` | 32-byte base64 (`openssl rand -base64 32`) — encrypts tenant ad tokens |
| `META_MODE` | `fixture` (default, replay) or `live` |
| `ANTHROPIC_API_KEY` + `ATLAS_AGENT_ENABLED=true` | enable the agent (both required) |

### 4. Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run test     # unit tests (attribution, rules, metrics, crypto)
```

Sign up → create a workspace → land on the dashboard. In **fixture mode** you can
connect any account id (e.g. `act_demo`) with no token, hit **Run pull now** in
Settings, and watch the full pipeline populate — metrics, campaigns, rule shadow
events — with no live credentials.

---

## Outcome ingestion — the decoupling layer

Atlas never reaches into anyone's CRM. Outcomes come **to** Atlas:

- **Webhook** (primary): `POST /api/ingest/outcomes` with header
  `x-atlas-key: <source secret>`. Idempotent on `external_ref`.
- **CSV**: column-mapper import on `/outcomes`.
- **Manual**: a form on `/outcomes`.

Attribution ladder (`lib/attribution.ts`): `click_id` → `utm` → `contact_hash`
inheritance → otherwise **unmatched** (excluded from cost-per-outcome math, shown
honestly as unattributed revenue — never guessed).

Example webhook body:

```json
{ "external_ref": "deal_8811", "occurred_at": "2026-07-21T18:04:00Z",
  "stage": "closed", "value": 2400, "click_id": "fb.1.1699...",
  "utm": { "campaign": "spring_promo", "content": "act_demo_camp_spring_ad_1" } }
```

---

## Cron schedule (`vercel.json`)

| Route | Schedule | Job |
|---|---|---|
| `/api/pull/metrics` | `*/15 * * * *` | pull insights, join outcomes, run rule engine |
| `/api/pull/competitors` | `10 7 * * *` | Ad Library upsert, run-length, inactive flip |
| `/api/pull/signals` | `40 6 * * *` | trends / weather / season (best-effort) |
| `/api/agent/nightly` | `30 3 * * *` | nightly digest (if agent enabled) |
| `/api/agent/weekly` | `0 5 * * 1` | weekly synthesis + creative calendar |

Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
`CRON_SECRET` is set in project env.

---

## Rule engine invariants (hard-coded, not parameters)

- New workspaces start **shadow** (`armed=false`) — the engine records what it
  *would* do and touches nothing.
- No rule may ever **raise** a daily cap.
- **Staleness guard**: no action on snapshots older than 45 minutes.
- Every executed action is reversible in one call from `detail.before`.
- Every trigger writes a `rule_events` row — executed, shadowed, or queued.
- Attribution coverage below the floor → `kill_cpo` auto-suspends and the agent
  lowers its confidence.
- One workspace flag (`settings.atlas.enabled=false`) darkens a tenant entirely.

---

## Safety model

- The **service-role key** (cron, webhook, engine, agent) bypasses RLS. Everything
  user-facing uses the anon key and is fully constrained by RLS = "member of
  workspace." Cross-workspace reads and writes are blocked at the database.
- Tenant ad-platform tokens are stored **AES-256-GCM encrypted** at rest.
- The agent's only writes are `briefs` and `creative_slots`, plus `request_approval`.
  It cannot call any ad API, change a budget, arm a rule, or publish creative.

---

## Project layout

```
supabase/migrations/001_atlas_core.sql   schema + RLS + bootstrap
lib/
  supabase/{server,browser,service}.ts   RLS-scoped + service clients
  auth.ts        requireMember(role)
  crypto.ts      AES-GCM token encryption
  attribution.ts resolution ladder + coverage
  metrics.ts     pure derived-metric math
  platforms/meta.ts    insights + ad library, fixture/replay + live
  pull/{metrics,competitors,signals}.ts  the monitors
  rules/{defaults,invariants,engine,actions}.ts  the rule engine
  agent/{atlas,tools,validate}.ts        the agent (flag-gated)
  ingest/outcomes.ts                     outcome intake + attribution
app/(auth)/…      login, signup, onboarding
app/(app)/…       dashboard, campaigns, outcomes, rules, competitors,
                  signals, calendar, briefs, settings
app/api/…         pull, ingest, agent, actions, health
components/…      ui + charts (self-contained inline SVG)
tests/…           attribution, rules, metrics, crypto
```
