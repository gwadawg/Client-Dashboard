-- One row per loan transaction (file). Two loans on the same house are two
-- rows. Person-level conversion (unique contact × proposal/submission/funded)
-- stays on events. This table is production volume.

create table if not exists loan_deals (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references clients(id) on delete cascade,
  ghl_contact_id       text,
  lead_name            text,
  lead_phone           text,
  lead_email           text,
  transaction_label    text,
  stage                text not null,
  submitted_at         timestamptz not null,
  funded_at            timestamptz,
  loan_size            numeric(14, 2),
  commission_amount    numeric(12, 2),
  conversion_event_id  uuid references events(id) on delete set null,
  source               text not null default 'loan_log_form',
  raw                  jsonb not null default '{}'::jsonb,
  inserted_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint loan_deals_stage_check check (stage in ('submitted', 'funded')),
  constraint loan_deals_funded_at_check check (
    (stage = 'submitted' and funded_at is null)
    or (stage = 'funded' and funded_at is not null)
  ),
  constraint loan_deals_source_check check (
    source in ('loan_log_form', 'webhook', 'backfill')
  )
);

create index if not exists loan_deals_client_funded_idx
  on loan_deals (client_id, funded_at desc)
  where funded_at is not null;

create index if not exists loan_deals_client_submitted_idx
  on loan_deals (client_id, submitted_at desc);

create index if not exists loan_deals_contact_idx
  on loan_deals (client_id, ghl_contact_id)
  where ghl_contact_id is not null;

create unique index if not exists loan_deals_conversion_event_uidx
  on loan_deals (conversion_event_id)
  where conversion_event_id is not null;

-- Accidental double-submit: same person, same size, same transaction label, same day.
create unique index if not exists loan_deals_identity_day_uidx
  on loan_deals (
    client_id,
    ghl_contact_id,
    loan_size,
    coalesce(lower(btrim(transaction_label)), ''),
    (timezone('UTC', coalesce(funded_at, submitted_at)))::date
  )
  where ghl_contact_id is not null and loan_size is not null;

alter table loan_deals enable row level security;

do $$ begin
  create policy loan_deals_read on loan_deals
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on loan_deals to authenticated;
grant all on loan_deals to service_role;

-- Historical grain was one conversion event per contact. Seed one deal per
-- funded event; then one submitted deal only when that contact never funded.
insert into loan_deals (
  client_id, ghl_contact_id, lead_name, lead_phone, lead_email,
  stage, submitted_at, funded_at, loan_size, commission_amount,
  conversion_event_id, source, raw
)
select
  e.client_id,
  e.ghl_contact_id,
  e.lead_name,
  e.lead_phone,
  e.lead_email,
  'funded',
  e.occurred_at,
  e.occurred_at,
  case
    when coalesce(e.raw->>'loan_size', e.raw->>'loan_amount') ~ '^[0-9]+(\.[0-9]+)?$'
      then coalesce(e.raw->>'loan_size', e.raw->>'loan_amount')::numeric
    else null
  end,
  case
    when e.raw->>'commission_amount' ~ '^[0-9]+(\.[0-9]+)?$'
      then (e.raw->>'commission_amount')::numeric
    else null
  end,
  e.id,
  'backfill',
  jsonb_build_object('backfill_event_type', e.event_type)
from events e
where e.event_type in ('loan_funded', 'closed')
  and not exists (
    select 1 from loan_deals d where d.conversion_event_id = e.id
  );

insert into loan_deals (
  client_id, ghl_contact_id, lead_name, lead_phone, lead_email,
  stage, submitted_at, funded_at, loan_size, commission_amount,
  conversion_event_id, source, raw
)
select
  e.client_id,
  e.ghl_contact_id,
  e.lead_name,
  e.lead_phone,
  e.lead_email,
  'submitted',
  e.occurred_at,
  null,
  case
    when coalesce(e.raw->>'loan_size', e.raw->>'loan_amount') ~ '^[0-9]+(\.[0-9]+)?$'
      then coalesce(e.raw->>'loan_size', e.raw->>'loan_amount')::numeric
    else null
  end,
  null,
  e.id,
  'backfill',
  jsonb_build_object('backfill_event_type', e.event_type)
from events e
where e.event_type in ('submission_made', 'loan_processing')
  and not exists (
    select 1 from loan_deals d where d.conversion_event_id = e.id
  )
  and not exists (
    select 1 from loan_deals d
    where d.client_id = e.client_id
      and d.stage = 'funded'
      and d.ghl_contact_id is not distinct from e.ghl_contact_id
      and coalesce(d.ghl_contact_id, '') <> ''
  );
