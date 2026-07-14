-- Curated dial / sales-call examples for coaching.
-- Separate from team_calls (meetings) and client_calls (account CRM).
-- domain=call_center sources events; domain=b2b sources acquisition_dials|acquisition_calls.

create table if not exists dial_examples (
  id uuid primary key default gen_random_uuid(),

  domain text not null,
  source text not null,
  source_id uuid not null,

  title text not null,
  recording_url text not null,
  called_at timestamptz not null,
  duration_seconds int,
  agent_name text,
  lead_name text,
  lead_phone text,

  -- Call-center product line (RM / DSCR / HE)
  lead_type text,
  -- B2B touch type when relevant (intro / demo / dial / followup / …)
  call_type text,
  grade text,

  summary text,
  transcript text,
  highlights jsonb not null default '[]',
  tags text[] not null default '{}',

  client_id uuid references clients(id) on delete set null,
  lead_id uuid references acquisition_leads(id) on delete set null,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  constraint dial_examples_domain_check check (domain in ('call_center', 'b2b')),
  constraint dial_examples_source_check check (
    source in ('events', 'acquisition_dials', 'acquisition_calls')
  ),
  constraint dial_examples_domain_source_check check (
    (domain = 'call_center' and source = 'events')
    or (domain = 'b2b' and source in ('acquisition_dials', 'acquisition_calls'))
  ),
  constraint dial_examples_lead_type_check check (
    lead_type is null or lead_type in ('RM', 'DSCR', 'HE')
  ),
  constraint dial_examples_grade_check check (
    grade is null or grade in ('A+', 'A', 'A-', 'B')
  )
);

create unique index if not exists dial_examples_source_unique
  on dial_examples (source, source_id)
  where deleted_at is null;

create index if not exists dial_examples_domain_called
  on dial_examples (domain, called_at desc)
  where deleted_at is null;

create index if not exists dial_examples_lead_type
  on dial_examples (lead_type)
  where lead_type is not null and deleted_at is null;

create index if not exists dial_examples_grade
  on dial_examples (grade)
  where grade is not null and deleted_at is null;

create index if not exists dial_examples_tags
  on dial_examples using gin (tags);

comment on table dial_examples is
  'Curated graded dial/sales examples for call-center reps and B2B. Not team meetings or client CRM calls.';
comment on column dial_examples.source_id is
  'PK of events / acquisition_dials / acquisition_calls row this example was promoted from.';

alter table dial_examples enable row level security;

do $$ begin
  create policy dial_examples_read on dial_examples
    for select to authenticated using (deleted_at is null);
exception when duplicate_object then null; end $$;
