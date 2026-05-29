-- Client Success: history/log tables (same Supabase project as the dashboard).
-- Safe to re-run: all statements use IF NOT EXISTS.
-- Run in: Supabase Dashboard > SQL Editor > New query.

-- Frozen periodic verdicts so progress is measured against a real recorded baseline.
create table if not exists client_health_snapshots (
  id                  uuid    primary key default gen_random_uuid(),
  client_id           uuid    not null references clients(id) on delete cascade,
  period_start        date    not null,
  period_end          date    not null,
  window_code         text,
  cpconv              numeric,
  cpql                numeric,
  cpl                 numeric,
  conversation_yield  numeric,
  show_rate           numeric,
  booking_rate        numeric,
  lead_to_qual        numeric,
  attention_score     numeric,
  worst_tier          text,
  primary_constraint  text,
  constraint_label    text,
  metrics             jsonb,
  ai_diagnosis        jsonb,
  created_by          uuid    references auth.users(id) on delete set null,
  created_at          timestamptz default now()
);

-- The change history: what the team changed on an account and whether it helped.
create table if not exists client_action_logs (
  id                   uuid    primary key default gen_random_uuid(),
  client_id            uuid    not null references clients(id) on delete cascade,
  created_by           uuid    references auth.users(id) on delete set null,
  created_at           timestamptz default now(),
  title                text    not null,
  layer                text,
  constraint_label     text,
  change_description   text,
  hypothesis           text,
  baseline_snapshot_id uuid    references client_health_snapshots(id) on delete set null,
  success_metric       text,
  baseline_value       numeric,
  target_value         numeric,
  status               text    not null default 'planned',
  review_date          date,
  outcome_value        numeric,
  outcome_notes        text,
  outcome_recorded_at  timestamptz,
  ai_generated         boolean not null default false,
  constraint client_action_logs_status_check check (
    status in ('planned', 'in_progress', 'measuring', 'succeeded', 'failed', 'abandoned')
  )
);

create index if not exists client_health_snapshots_client_period on client_health_snapshots(client_id, period_end desc);
create index if not exists client_action_logs_client_created     on client_action_logs(client_id, created_at desc);
create index if not exists client_action_logs_status             on client_action_logs(status);
