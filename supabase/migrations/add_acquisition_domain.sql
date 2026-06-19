-- WM Acquisition domain — separate from client fulfillment (clients + events).
-- Sales funnel: Meta → intro → demo → offer → close (New Client form).

-- ── Sales team (acquisition setters/closers — not fulfillment agents) ───────
create table if not exists sales_reps (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null default 'setter',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sales_reps_name_key unique (name),
  constraint sales_reps_role_check check (role in ('setter', 'closer', 'both'))
);

create table if not exists sales_rep_compensation_versions (
  id             uuid primary key default gen_random_uuid(),
  sales_rep_id   uuid not null references sales_reps(id) on delete cascade,
  effective_from date not null,
  effective_to   date,
  rates          jsonb not null default '{}',
  note           text,
  created_at     timestamptz not null default now(),
  created_by     text
);

create index if not exists sales_rep_comp_versions_rep_from
  on sales_rep_compensation_versions (sales_rep_id, effective_from desc);

-- ── Leads (prospects — not clients) ───────────────────────────────────────────
create table if not exists acquisition_leads (
  id                  uuid primary key default gen_random_uuid(),
  ghl_contact_id      text,
  sheet_lead_key      text,
  lead_name           text,
  email               text,
  phone               text,
  source              text,
  offer_interest      text,
  qualified           boolean,
  ad_set              text,
  ad_name             text,
  created_at          timestamptz not null,
  converted_client_id uuid references clients(id) on delete set null,
  close_source        text,
  raw                 jsonb not null default '{}',
  inserted_at         timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists acquisition_leads_ghl_contact_id_key
  on acquisition_leads (ghl_contact_id) where ghl_contact_id is not null;

create unique index if not exists acquisition_leads_sheet_lead_key_key
  on acquisition_leads (sheet_lead_key) where sheet_lead_key is not null;

create index if not exists acquisition_leads_created_at_idx
  on acquisition_leads (created_at desc);

create index if not exists acquisition_leads_source_idx
  on acquisition_leads (source);

create index if not exists acquisition_leads_phone_idx
  on acquisition_leads (phone) where phone is not null;

-- ── Appointments ──────────────────────────────────────────────────────────────
create table if not exists acquisition_appointments (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references acquisition_leads(id) on delete cascade,
  ghl_appointment_id  text,
  sheet_appointment_key text,
  appointment_type    text not null,
  calendar_id         text,
  booking_source      text,
  how_booked          text,
  booked_at           timestamptz,
  scheduled_at        timestamptz,
  status              text not null default 'pending',
  qualified           boolean,
  setter_name         text,
  call_taken_by       text,
  lead_name           text,
  phone               text,
  raw                 jsonb not null default '{}',
  inserted_at         timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint acquisition_appointments_type_check check (
    appointment_type in ('intro', 'demo', 'bamfam', 'followup', 'organic', 'other')
  ),
  constraint acquisition_appointments_status_check check (
    status in ('showed', 'no_show', 'cancelled', 'team_no_show', 'pending')
  )
);

create unique index if not exists acquisition_appointments_ghl_appt_id_key
  on acquisition_appointments (ghl_appointment_id) where ghl_appointment_id is not null;

create unique index if not exists acquisition_appointments_sheet_key_key
  on acquisition_appointments (sheet_appointment_key) where sheet_appointment_key is not null;

create index if not exists acquisition_appointments_booked_at_idx
  on acquisition_appointments (booked_at desc);

create index if not exists acquisition_appointments_scheduled_at_idx
  on acquisition_appointments (scheduled_at desc);

create index if not exists acquisition_appointments_setter_idx
  on acquisition_appointments (setter_name);

create index if not exists acquisition_appointments_lead_id_idx
  on acquisition_appointments (lead_id);

-- ── Offers ────────────────────────────────────────────────────────────────────
create table if not exists acquisition_offers (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid references acquisition_leads(id) on delete set null,
  appointment_id    uuid references acquisition_appointments(id) on delete set null,
  offered_at        timestamptz not null,
  offer_type        text not null,
  is_closed         boolean not null default false,
  cash_collected    numeric(12, 2),
  setter_name       text,
  offered_by        text,
  appointment_type  text,
  recording_link    text,
  ghl_contact_link  text,
  raw               jsonb not null default '{}',
  inserted_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists acquisition_offers_offered_at_idx
  on acquisition_offers (offered_at desc);

create index if not exists acquisition_offers_lead_id_idx
  on acquisition_offers (lead_id);

create unique index if not exists acquisition_offers_appt_type_key
  on acquisition_offers (appointment_id, offer_type)
  where appointment_id is not null;

-- ── Closes (bridge to clients roster / new_client form) ─────────────────────────
create table if not exists acquisition_closes (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid references acquisition_leads(id) on delete set null,
  offer_id             uuid references acquisition_offers(id) on delete set null,
  client_id            uuid references clients(id) on delete set null,
  form_submission_id   uuid references client_form_submissions(id) on delete set null,
  closed_at            timestamptz not null,
  close_source         text not null default 'roster',
  cash_collected       numeric(12, 2),
  setter_name          text,
  offer_type           text,
  raw                  jsonb not null default '{}',
  inserted_at          timestamptz not null default now(),
  constraint acquisition_closes_close_source_check check (
    close_source in ('new_client_form', 'offer_sheet', 'roster', 'manual')
  )
);

create index if not exists acquisition_closes_closed_at_idx
  on acquisition_closes (closed_at desc);

create index if not exists acquisition_closes_client_id_idx
  on acquisition_closes (client_id);

create unique index if not exists acquisition_closes_client_id_key
  on acquisition_closes (client_id) where client_id is not null;

-- ── Waiz-owned ad spend (no client_id) ────────────────────────────────────────
create table if not exists acquisition_ad_insights (
  id                      uuid primary key default gen_random_uuid(),
  insight_date            date not null,
  platform                text not null default 'facebook',
  adset_name              text not null default '',
  ad_name                 text not null default '',
  amount_spent            numeric(12, 2) not null default 0,
  reach                   bigint,
  impressions             bigint,
  cpm                     numeric(12, 4),
  unique_outbound_clicks  bigint,
  cost_per_outbound_click numeric(12, 4),
  raw                     jsonb not null default '{}',
  inserted_at             timestamptz not null default now(),
  constraint acquisition_ad_insights_unique_key unique (insight_date, platform, adset_name, ad_name)
);

create index if not exists acquisition_ad_insights_date_idx
  on acquisition_ad_insights (insight_date desc);

-- ── Dials (acquisition GHL location) ───────────────────────────────────────────
create table if not exists acquisition_dials (
  id              uuid primary key default gen_random_uuid(),
  ghl_contact_id  text,
  lead_id         uuid references acquisition_leads(id) on delete set null,
  occurred_at     timestamptz not null,
  phone           text,
  duration_seconds int,
  outcome         text,
  agent_name      text,
  recording_url   text,
  raw             jsonb not null default '{}',
  inserted_at     timestamptz not null default now()
);

create index if not exists acquisition_dials_occurred_at_idx
  on acquisition_dials (occurred_at desc);

-- ── Calendar config (intro/demo mapping) ───────────────────────────────────────
create table if not exists acquisition_calendar_config (
  calendar_id       text primary key,
  calendar_name     text not null,
  appointment_type  text not null,
  include_in_meta_funnel boolean not null default true,
  constraint acquisition_calendar_config_type_check check (
    appointment_type in ('intro', 'demo', 'bamfam', 'followup', 'organic', 'other', 'exclude')
  )
);

insert into acquisition_calendar_config (calendar_id, calendar_name, appointment_type, include_in_meta_funnel) values
  ('0ovb9efYBrznUlzxwehn', 'WaizMedia Reverse MLO', 'intro', true),
  ('IOCSMi5TkDwbxTbBJryk', 'WM Reverse Strat Call', 'intro', true),
  ('cKJhOoyiVEI7dSKhiRo6', 'General Inquiry', 'intro', true),
  ('71fF0PpCgY8Qv1PqeMFa', 'Demo', 'demo', true),
  ('1646rGKZxuR0xEyTFBOf', 'BAMFAM', 'bamfam', false),
  ('nd226mcEAkl0ozC5EtVl', 'Follow Up', 'followup', false),
  ('hZGp8KwdrAPzWnnhPTYq', 'Skool Inquiry', 'other', false),
  ('wnY0aW4tzhvnAZk295Rz', 'HE | WaizMedia Calendar', 'other', false),
  ('et6sPpJBLqwx7VM2vNoq', 'Cold Prospect', 'other', false)
on conflict (calendar_id) do nothing;

-- ── RLS (authenticated read; service role writes via API) ─────────────────────
alter table sales_reps enable row level security;
alter table sales_rep_compensation_versions enable row level security;
alter table acquisition_leads enable row level security;
alter table acquisition_appointments enable row level security;
alter table acquisition_offers enable row level security;
alter table acquisition_closes enable row level security;
alter table acquisition_ad_insights enable row level security;
alter table acquisition_dials enable row level security;
alter table acquisition_calendar_config enable row level security;

do $$ begin
  create policy acquisition_read_authenticated on sales_reps for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_comp_read on sales_rep_compensation_versions for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_leads_read on acquisition_leads for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_appts_read on acquisition_appointments for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_offers_read on acquisition_offers for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_closes_read on acquisition_closes for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_ads_read on acquisition_ad_insights for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_dials_read on acquisition_dials for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy acquisition_cal_read on acquisition_calendar_config for select to authenticated using (true);
exception when duplicate_object then null; end $$;
