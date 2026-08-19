-- Effective dating on agent versions + Closebot incident tickets.

alter table closebot_agent_versions
  add column if not exists went_live_at timestamptz,
  add column if not exists superseded_at timestamptz;

-- Best-effort backfill from existing timestamps.
update closebot_agent_versions
set went_live_at = created_at
where status in ('live', 'superseded')
  and went_live_at is null;

update closebot_agent_versions
set superseded_at = updated_at
where status = 'superseded'
  and superseded_at is null;

create index if not exists closebot_agent_versions_as_of_idx
  on closebot_agent_versions (agent_id, went_live_at desc)
  where status in ('live', 'superseded') and went_live_at is not null;

create table if not exists closebot_tickets (
  id                 uuid primary key default gen_random_uuid(),
  occurred_at        timestamptz not null,
  bug_type           text not null,
  description        text not null,
  contact_url        text not null,
  client_id          uuid not null references clients (id) on delete restrict,
  agent_id           uuid not null references closebot_agents (id) on delete restrict,
  agent_version_id   uuid references closebot_agent_versions (id) on delete set null,
  status             text not null default 'new',
  reporter_name      text not null,
  prompt_log_id      uuid references closebot_prompt_log (id) on delete set null,
  status_notes       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint closebot_tickets_bug_type_check check (
    bug_type in (
      'wrong_reply',
      'booking_fail',
      'transfer_fail',
      'loop_stuck',
      'persona_tone',
      'compliance',
      'integration',
      'other'
    )
  ),
  constraint closebot_tickets_status_check check (
    status in (
      'new',
      'investigating',
      'ticket_open',
      'resolved_no_change',
      'resolved_updated_agent'
    )
  )
);

create index if not exists closebot_tickets_open_status_idx
  on closebot_tickets (status, occurred_at desc)
  where status in ('new', 'investigating', 'ticket_open');

create index if not exists closebot_tickets_agent_occurred_idx
  on closebot_tickets (agent_id, occurred_at desc);

create index if not exists closebot_tickets_version_idx
  on closebot_tickets (agent_version_id)
  where agent_version_id is not null;

create index if not exists closebot_tickets_client_occurred_idx
  on closebot_tickets (client_id, occurred_at desc);
