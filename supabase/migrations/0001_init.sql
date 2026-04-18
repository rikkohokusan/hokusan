-- Hokusan Insights Dashboard — initial schema
-- Apply via Supabase Studio SQL editor (one-time), or `supabase db push` with a PAT.
-- Safe to re-run: uses IF NOT EXISTS and idempotent policy drops.

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists public.weekly_snapshots (
  id bigserial primary key,
  week_start date not null unique,
  revenue_cad numeric(12,2) not null default 0,
  orders_count integer not null default 0,
  new_leads_count integer not null default 0,
  leads_activated_count integer not null default 0,
  trials_graduated_count integer not null default 0,
  dormant_reactivated_count integer not null default 0,
  basket_eroding_count integer not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_weekly_snapshots_week_start on public.weekly_snapshots (week_start desc);

do $$ begin
  create type public.outcome_type as enum (
    'reorder_landed',
    'trial_graduated',
    'dormant_reactivated',
    'lead_converted'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.outcomes_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  account_name text not null,
  outcome_type public.outcome_type not null,
  value_cad numeric(12,2),
  notes text,
  pipedrive_org_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_outcomes_log_created_at on public.outcomes_log (created_at desc);
create index if not exists idx_outcomes_log_user on public.outcomes_log (user_id);

-- ============================================================================
-- 2. Row-Level Security
-- Only @hokusan.ca emails may read/write. Service role bypasses RLS (used by sync job).
-- ============================================================================

alter table public.weekly_snapshots enable row level security;
alter table public.outcomes_log     enable row level security;

-- weekly_snapshots: any hokusan.ca user can read; inserts/updates by service role only.
drop policy if exists weekly_snapshots_read on public.weekly_snapshots;
create policy weekly_snapshots_read on public.weekly_snapshots
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'email') ilike '%@hokusan.ca'
  );

-- outcomes_log: hokusan.ca users can read all, insert their own, update their own.
drop policy if exists outcomes_log_read on public.outcomes_log;
create policy outcomes_log_read on public.outcomes_log
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'email') ilike '%@hokusan.ca'
  );

drop policy if exists outcomes_log_insert on public.outcomes_log;
create policy outcomes_log_insert on public.outcomes_log
  for insert
  to authenticated
  with check (
    (auth.jwt() ->> 'email') ilike '%@hokusan.ca'
    and user_id = auth.uid()
  );

drop policy if exists outcomes_log_update_own on public.outcomes_log;
create policy outcomes_log_update_own on public.outcomes_log
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- 3. Convenience view — last 12 weekly snapshots for trend charts
-- ============================================================================

create or replace view public.weekly_snapshots_last_12 as
  select *
  from public.weekly_snapshots
  order by week_start desc
  limit 12;

comment on table public.weekly_snapshots is 'Weekly business snapshot written by scripts/sync-weekly.mjs every Monday 07:00 America/Toronto.';
comment on table public.outcomes_log is 'Sales/ops outcome log. Each row is a landed reorder, graduated trial, reactivated dormant, or converted lead.';
