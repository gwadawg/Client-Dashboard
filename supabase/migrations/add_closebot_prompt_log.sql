-- Closebot agent directory + prompt change log (ops timeline).
-- Mutations gated in app code via closebot_log permission; FKs use auth.users.

create table if not exists closebot_agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint closebot_agents_slug_unique unique (slug)
);

create index if not exists closebot_agents_active_sort_idx
  on closebot_agents (is_active, sort_order, name);

create table if not exists closebot_prompt_log (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references closebot_agents (id) on delete restrict,
  changed_at      timestamptz not null,
  prompt_body     text not null,
  problem_solved  text not null,
  change_reason   text not null,
  reference_urls  text[] not null default '{}',
  status          text not null default 'watching',
  outcome_notes   text,
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint closebot_prompt_log_status_check check (
    status in ('open', 'watching', 'worked', 'did_not_work', 'reverted')
  )
);

create index if not exists closebot_prompt_log_changed_at_idx
  on closebot_prompt_log (changed_at desc);

create index if not exists closebot_prompt_log_agent_changed_idx
  on closebot_prompt_log (agent_id, changed_at desc);

create index if not exists closebot_prompt_log_open_status_idx
  on closebot_prompt_log (status)
  where status in ('open', 'watching');
