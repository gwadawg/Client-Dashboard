-- Closebot personas, live agent snapshots, version history, log → version link.

create table if not exists closebot_personas (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text not null,
  description            text,
  how_to_respond         text,
  tone                   text[] not null default '{}',
  custom_delay_enabled   boolean not null default false,
  typo_frequency         numeric,
  custom_delay_seconds   integer,
  is_active              boolean not null default true,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint closebot_personas_slug_unique unique (slug)
);

create index if not exists closebot_personas_active_sort_idx
  on closebot_personas (is_active, sort_order, name);

alter table closebot_agents
  add column if not exists job_information text,
  add column if not exists persona_id uuid references closebot_personas (id) on delete set null,
  add column if not exists nodes jsonb not null default '[]'::jsonb,
  add column if not exists follow_ups jsonb not null default '[]'::jsonb;

create index if not exists closebot_agents_persona_id_idx
  on closebot_agents (persona_id)
  where persona_id is not null;

create table if not exists closebot_agent_versions (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references closebot_agents (id) on delete restrict,
  status             text not null,
  name               text not null,
  description        text,
  job_information    text,
  persona_id         uuid references closebot_personas (id) on delete set null,
  persona_snapshot   jsonb,
  nodes              jsonb not null default '[]'::jsonb,
  follow_ups         jsonb not null default '[]'::jsonb,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint closebot_agent_versions_status_check check (
    status in ('pending', 'live', 'superseded', 'rejected')
  )
);

create index if not exists closebot_agent_versions_agent_updated_idx
  on closebot_agent_versions (agent_id, updated_at desc);

create unique index if not exists closebot_agent_versions_one_pending_idx
  on closebot_agent_versions (agent_id)
  where status = 'pending';

alter table closebot_prompt_log
  add column if not exists agent_version_id uuid references closebot_agent_versions (id) on delete set null;

create index if not exists closebot_prompt_log_version_idx
  on closebot_prompt_log (agent_version_id)
  where agent_version_id is not null;

-- Seed a live version for agents that already exist so history is complete.
insert into closebot_agent_versions (
  agent_id,
  status,
  name,
  description,
  job_information,
  persona_id,
  persona_snapshot,
  nodes,
  follow_ups,
  created_at,
  updated_at
)
select
  a.id,
  'live',
  a.name,
  a.description,
  a.job_information,
  a.persona_id,
  null,
  coalesce(a.nodes, '[]'::jsonb),
  coalesce(a.follow_ups, '[]'::jsonb),
  a.created_at,
  a.updated_at
from closebot_agents a
where not exists (
  select 1 from closebot_agent_versions v where v.agent_id = a.id
);
