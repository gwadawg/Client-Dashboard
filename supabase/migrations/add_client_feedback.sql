-- Structured churn/feedback: reason codes on lifecycle history + ongoing client notes.

alter table client_status_history add column if not exists reason_code text;

alter table client_status_history drop constraint if exists client_status_history_reason_code_check;
alter table client_status_history add constraint client_status_history_reason_code_check check (
  reason_code is null or reason_code in (
    'poor_results', 'pricing_cost', 'went_in_house', 'business_closed',
    'contract_ended', 'service_issues', 'competitor', 'unresponsive',
    'mutual_decision', 'other'
  )
);

create table if not exists client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  note_type   text not null default 'general',
  reason_code text,
  body        text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  constraint client_notes_type_check check (
    note_type in ('general', 'concern', 'win', 'internal')
  ),
  constraint client_notes_reason_code_check check (
    reason_code is null or reason_code in (
      'poor_results', 'pricing_cost', 'went_in_house', 'business_closed',
      'contract_ended', 'service_issues', 'competitor', 'unresponsive',
      'mutual_decision', 'other'
    )
  )
);

create index if not exists client_notes_client_created on client_notes(client_id, created_at desc);
