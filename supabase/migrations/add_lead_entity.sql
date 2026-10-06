-- Lead entity: one row per person per client. events and loan_deals point at it
-- through lead_id. Additive only: no existing column is changed or dropped.
-- Design: docs/superpowers/specs/2026-10-02-lead-entity-design.md
--
-- Indexes on events.lead_id / loan_deals.lead_id are built CONCURRENTLY in
-- add_lead_entity_indexes.sql (cannot run inside this transaction).

-- Fail fast instead of queueing webhook writes behind a long dashboard query.
set local lock_timeout = '5s';

-- ── Normalizers ──────────────────────────────────────────────────────────────

-- 10-digit US phone (strips a leading 1). Fewer than 10 digits is not an identity.
create or replace function public.normalize_lead_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when length(d) = 11 and left(d, 1) = '1' then substr(d, 2)
    when length(d) between 10 and 15 then d
    else null
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;

-- ghl_contact_id as written today. Loan-log `ldr:{client}:unknown` is not an identity.
create or replace function public.clean_lead_contact_id(v text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(v), '') is null then null
    when btrim(v) like 'ldr:%:unknown' then null
    else btrim(v)
  end
$$;

create or replace function public.lead_contact_kind(v text)
returns text
language sql
immutable
as $$
  select case
    when v is null then null
    when v like 'ldr:%' then 'synthetic'
    else 'ghl_contact'
  end
$$;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists leads (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references clients(id) on delete cascade,
  lead_name            text,
  lead_phone           text,
  lead_email           text,
  -- Primary real GHL id. lead_identities is authoritative and may hold more.
  ghl_contact_id       text,
  origin_event_type    text,
  origin_source        text,
  first_seen_at        timestamptz not null,
  lead_created_at      timestamptz,
  first_lead_event_id  uuid references events(id) on delete set null,
  -- First-touch attribution. A lead event's ad beats any other event's ad;
  -- among the same kind, the earliest wins.
  utm_content          text,
  ad_name              text,
  adset_name           text,
  campaign_name        text,
  utm_source           text,
  utm_campaign         text,
  lead_source          text,
  ad_event_id          uuid references events(id) on delete set null,
  ad_event_at          timestamptz,
  ad_from_lead_event   boolean not null default false,
  merged_into_id       uuid references leads(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint leads_not_self_merged check (merged_into_id is distinct from id)
);

create index if not exists leads_client_first_seen_idx
  on leads (client_id, first_seen_at desc);
create index if not exists leads_client_utm_content_idx
  on leads (client_id, utm_content)
  where utm_content is not null;
create index if not exists leads_ghl_contact_id_idx
  on leads (ghl_contact_id)
  where ghl_contact_id is not null;
create index if not exists leads_merged_into_idx
  on leads (merged_into_id)
  where merged_into_id is not null;
create index if not exists leads_first_lead_event_idx
  on leads (first_lead_event_id)
  where first_lead_event_id is not null;
create index if not exists leads_ad_event_idx
  on leads (ad_event_id)
  where ad_event_id is not null;

create table if not exists lead_identities (
  id             bigint generated always as identity primary key,
  lead_id        uuid not null references leads(id) on delete cascade,
  client_id      uuid not null references clients(id) on delete cascade,
  kind           text not null,
  value          text not null,
  first_seen_at  timestamptz not null default now(),
  constraint lead_identities_kind_check check (
    kind in ('ghl_contact', 'synthetic', 'phone', 'email')
  ),
  constraint lead_identities_lead_value_key unique (client_id, kind, value, lead_id)
);

-- A GHL id or ldr key belongs to exactly one lead. Phones and emails can be
-- shared (households); sharing is queued in lead_identity_reviews.
create unique index if not exists lead_identities_strong_uidx
  on lead_identities (client_id, kind, value)
  where kind in ('ghl_contact', 'synthetic');
create index if not exists lead_identities_lead_idx
  on lead_identities (lead_id);

create table if not exists lead_identity_reviews (
  id                  bigint generated always as identity primary key,
  client_id           uuid not null references clients(id) on delete cascade,
  reason              text not null,
  review_key          text not null,
  candidate_lead_ids  uuid[] not null default '{}',
  status              text not null default 'open',
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint lead_identity_reviews_reason_check check (
    reason in ('shared_phone', 'shared_email')
  ),
  constraint lead_identity_reviews_status_check check (
    status in ('open', 'resolved', 'dismissed')
  ),
  constraint lead_identity_reviews_key unique (client_id, reason, review_key)
);

create index if not exists lead_identity_reviews_open_idx
  on lead_identity_reviews (client_id, created_at desc)
  where status = 'open';

create table if not exists lead_merges (
  id            bigint generated always as identity primary key,
  client_id     uuid not null references clients(id) on delete cascade,
  winner_id     uuid not null references leads(id),
  loser_id      uuid not null references leads(id),
  reason        text,
  merged_by     text,
  moved_counts  jsonb not null default '{}',
  merged_at     timestamptz not null default now()
);

create index if not exists lead_merges_winner_idx on lead_merges (winner_id);
create index if not exists lead_merges_loser_idx on lead_merges (loser_id);

-- ── Links on facts (nullable until backfill completes) ───────────────────────

alter table events add column if not exists lead_id uuid references leads(id);
alter table loan_deals add column if not exists lead_id uuid references leads(id);

-- ── Resolution ───────────────────────────────────────────────────────────────

create or replace function public.lead_canonical_id(p_lead uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_id uuid := p_lead;
  v_next uuid;
  v_hops int := 0;
begin
  loop
    select merged_into_id into v_next from leads where id = v_id;
    exit when v_next is null or v_hops >= 10;
    v_id := v_next;
    v_hops := v_hops + 1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.lead_attach_identity(
  p_lead uuid,
  p_client uuid,
  p_kind text,
  p_value text,
  p_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  if p_lead is null or p_value is null then
    return;
  end if;

  insert into lead_identities (lead_id, client_id, kind, value, first_seen_at)
  values (p_lead, p_client, p_kind, p_value, coalesce(p_at, now()))
  on conflict do nothing;

  if p_kind in ('phone', 'email') then
    select li.lead_id into v_other
    from lead_identities li
    join leads l on l.id = li.lead_id and l.merged_into_id is null
    where li.client_id = p_client
      and li.kind = p_kind
      and li.value = p_value
      and li.lead_id <> p_lead
    limit 1;

    if v_other is not null then
      insert into lead_identity_reviews (client_id, reason, review_key, candidate_lead_ids)
      values (
        p_client,
        'shared_' || p_kind,
        p_value,
        array[least(p_lead, v_other), greatest(p_lead, v_other)]
      )
      on conflict (client_id, reason, review_key) do update
        set candidate_lead_ids = (
          select array_agg(distinct x order by x)
          from unnest(lead_identity_reviews.candidate_lead_ids || excluded.candidate_lead_ids) as x
        );
    end if;
  end if;
end;
$$;

-- One soft-identity candidate set → a lead, or null when ambiguous or unsafe.
-- An incoming real GHL id never joins a lead that already has a different
-- real GHL id (two real contacts on one phone stay two people).
create or replace function public.lead_pick_candidate(p_candidates uuid[], p_incoming_kind text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
begin
  if p_candidates is null or cardinality(p_candidates) <> 1 then
    return null;
  end if;
  if p_incoming_kind = 'ghl_contact' and exists (
    select 1 from lead_identities
    where lead_id = p_candidates[1] and kind = 'ghl_contact'
  ) then
    return null;
  end if;
  return p_candidates[1];
end;
$$;

-- Find or create the lead for one client + identifiers. Order:
-- GHL id / ldr key → phone (single safe match) → email (single safe match) → new lead.
create or replace function public.resolve_lead(
  p_client_id   uuid,
  p_contact_id  text,
  p_phone       text,
  p_email       text,
  p_name        text,
  p_event_type  text default null,
  p_source      text default null,
  p_occurred_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact    text := clean_lead_contact_id(p_contact_id);
  v_kind       text := lead_contact_kind(clean_lead_contact_id(p_contact_id));
  v_phone      text := normalize_lead_phone(p_phone);
  v_email      text := nullif(lower(btrim(p_email)), '');
  v_name       text := nullif(btrim(p_name), '');
  v_at         timestamptz := coalesce(p_occurred_at, now());
  v_lead       uuid;
  v_new        uuid;
  v_candidates uuid[];
begin
  if p_client_id is null then
    return null;
  end if;
  if v_email is not null and position('@' in v_email) = 0 then
    v_email := null;
  end if;

  if v_contact is not null then
    select lead_id into v_lead
    from lead_identities
    where client_id = p_client_id and kind = v_kind and value = v_contact;
  end if;

  if v_lead is null and v_phone is not null then
    select array_agg(distinct li.lead_id) into v_candidates
    from lead_identities li
    join leads l on l.id = li.lead_id and l.merged_into_id is null
    where li.client_id = p_client_id and li.kind = 'phone' and li.value = v_phone;
    v_lead := lead_pick_candidate(v_candidates, v_kind);
  end if;

  if v_lead is null and v_email is not null and coalesce(cardinality(v_candidates), 0) = 0 then
    select array_agg(distinct li.lead_id) into v_candidates
    from lead_identities li
    join leads l on l.id = li.lead_id and l.merged_into_id is null
    where li.client_id = p_client_id and li.kind = 'email' and li.value = v_email;
    v_lead := lead_pick_candidate(v_candidates, v_kind);
  end if;

  if v_lead is null then
    insert into leads (
      client_id, lead_name, lead_phone, lead_email, ghl_contact_id,
      origin_event_type, origin_source, first_seen_at
    )
    values (
      p_client_id, v_name, v_phone, v_email,
      case when v_kind = 'ghl_contact' then v_contact end,
      p_event_type, nullif(btrim(p_source), ''), v_at
    )
    returning id into v_new;

    if v_contact is not null then
      insert into lead_identities (lead_id, client_id, kind, value, first_seen_at)
      values (v_new, p_client_id, v_kind, v_contact, v_at)
      on conflict do nothing;

      -- Lost a race: another transaction registered this id first.
      select lead_id into v_lead
      from lead_identities
      where client_id = p_client_id and kind = v_kind and value = v_contact;
      if v_lead is distinct from v_new then
        delete from leads where id = v_new;
      end if;
    else
      v_lead := v_new;
    end if;
  else
    v_lead := lead_canonical_id(v_lead);
    perform lead_attach_identity(v_lead, p_client_id, v_kind, v_contact, v_at);
    if v_kind = 'ghl_contact' then
      update leads set ghl_contact_id = v_contact, updated_at = now()
      where id = v_lead and ghl_contact_id is null;
    end if;
  end if;

  perform lead_attach_identity(v_lead, p_client_id, 'phone', v_phone, v_at);
  perform lead_attach_identity(v_lead, p_client_id, 'email', v_email, v_at);

  return v_lead;
end;
$$;

-- Recompute derived lead fields from that lead's events and deals.
-- Order-independent: safe to run any number of times.
create or replace function public.refresh_lead(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_lead record;
  v_ad         record;
  v_source     text;
  v_seen       timestamptz;
  v_deal_seen  timestamptz;
begin
  if p_lead is null then
    return;
  end if;

  select id, occurred_at, lead_name, lead_email into v_first_lead
  from events
  where lead_id = p_lead and event_type = 'lead'
  order by occurred_at, id
  limit 1;

  select
    id,
    occurred_at,
    event_type = 'lead' as from_lead,
    coalesce(nullif(btrim(utm_content), ''), nullif(btrim(ad_name), '')) as utm,
    coalesce(nullif(btrim(ad_name), ''), nullif(btrim(utm_content), '')) as ad,
    nullif(btrim(adset_name), '') as adset,
    nullif(btrim(campaign_name), '') as campaign,
    nullif(btrim(utm_source), '') as src,
    nullif(btrim(utm_campaign), '') as ucamp
  into v_ad
  from events
  where lead_id = p_lead
    and coalesce(nullif(btrim(utm_content), ''), nullif(btrim(ad_name), '')) is not null
  order by (event_type = 'lead') desc, occurred_at, id
  limit 1;

  select nullif(btrim(lead_source), '') into v_source
  from events
  where lead_id = p_lead and event_type = 'lead' and nullif(btrim(lead_source), '') is not null
  order by occurred_at, id
  limit 1;

  select min(occurred_at) into v_seen from events where lead_id = p_lead;
  select min(submitted_at) into v_deal_seen from loan_deals where lead_id = p_lead;

  update leads l set
    first_seen_at       = coalesce(least(v_seen, v_deal_seen), l.first_seen_at),
    lead_created_at     = v_first_lead.occurred_at,
    first_lead_event_id = v_first_lead.id,
    lead_name           = coalesce(l.lead_name, nullif(btrim(v_first_lead.lead_name), '')),
    utm_content         = v_ad.utm,
    ad_name             = v_ad.ad,
    adset_name          = v_ad.adset,
    campaign_name       = v_ad.campaign,
    utm_source          = v_ad.src,
    utm_campaign        = v_ad.ucamp,
    ad_event_id         = v_ad.id,
    ad_event_at         = v_ad.occurred_at,
    ad_from_lead_event  = coalesce(v_ad.from_lead, false),
    lead_source         = v_source,
    updated_at          = now()
  where l.id = p_lead;
end;
$$;

-- ── Triggers ─────────────────────────────────────────────────────────────────
-- Every trigger swallows its own errors: a failed link leaves lead_id null and
-- the event is still saved. scripts/assert-lead-integrity.mjs reports nulls.

create or replace function public.trg_events_resolve_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.lead_id is not null then
    return new;
  end if;
  begin
    new.lead_id := resolve_lead(
      new.client_id,
      new.ghl_contact_id,
      new.lead_phone,
      new.lead_email,
      new.lead_name,
      new.event_type,
      case when jsonb_typeof(new.raw) = 'object' then new.raw ->> 'source' end,
      new.occurred_at
    );
  exception when others then
    raise warning 'resolve_lead failed for event %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace function public.trg_events_refresh_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('leads.skip_refresh', true) = 'on' then
    return null;
  end if;
  begin
    if tg_op = 'INSERT' then
      perform refresh_lead(new.lead_id);
    elsif tg_op = 'UPDATE' then
      perform refresh_lead(new.lead_id);
      if old.lead_id is distinct from new.lead_id then
        perform refresh_lead(old.lead_id);
      end if;
    else
      perform refresh_lead(old.lead_id);
    end if;
  exception when others then
    raise warning 'refresh_lead failed: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists events_resolve_lead_insert on events;
create trigger events_resolve_lead_insert
  before insert on events
  for each row execute function trg_events_resolve_lead();

drop trigger if exists events_resolve_lead_update on events;
create trigger events_resolve_lead_update
  before update of client_id, ghl_contact_id, lead_phone, lead_email on events
  for each row
  when (
    old.client_id is distinct from new.client_id
    or old.ghl_contact_id is distinct from new.ghl_contact_id
    or old.lead_phone is distinct from new.lead_phone
    or old.lead_email is distinct from new.lead_email
  )
  execute function trg_events_resolve_lead();

drop trigger if exists events_refresh_lead_insert on events;
create trigger events_refresh_lead_insert
  after insert on events
  for each row execute function trg_events_refresh_lead();

drop trigger if exists events_refresh_lead_update on events;
create trigger events_refresh_lead_update
  after update on events
  for each row
  when (
    old.lead_id is distinct from new.lead_id
    or old.occurred_at is distinct from new.occurred_at
    or old.event_type is distinct from new.event_type
    or old.utm_content is distinct from new.utm_content
    or old.ad_name is distinct from new.ad_name
    or old.lead_source is distinct from new.lead_source
  )
  execute function trg_events_refresh_lead();

drop trigger if exists events_refresh_lead_delete on events;
create trigger events_refresh_lead_delete
  after delete on events
  for each row execute function trg_events_refresh_lead();

create or replace function public.trg_loan_deals_resolve_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.lead_id is not null then
    return new;
  end if;
  begin
    select e.lead_id into new.lead_id
    from events e
    where e.id = new.conversion_event_id and e.lead_id is not null;

    if new.lead_id is null then
      new.lead_id := resolve_lead(
        new.client_id,
        new.ghl_contact_id,
        new.lead_phone,
        new.lead_email,
        new.lead_name,
        'loan_deal',
        new.source,
        new.submitted_at
      );
    end if;
  exception when others then
    raise warning 'resolve_lead failed for loan_deal %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists loan_deals_resolve_lead_insert on loan_deals;
create trigger loan_deals_resolve_lead_insert
  before insert on loan_deals
  for each row execute function trg_loan_deals_resolve_lead();

drop trigger if exists loan_deals_resolve_lead_update on loan_deals;
create trigger loan_deals_resolve_lead_update
  before update of client_id, ghl_contact_id, lead_phone, conversion_event_id on loan_deals
  for each row
  when (
    old.client_id is distinct from new.client_id
    or old.ghl_contact_id is distinct from new.ghl_contact_id
    or old.lead_phone is distinct from new.lead_phone
    or old.conversion_event_id is distinct from new.conversion_event_id
  )
  execute function trg_loan_deals_resolve_lead();

-- ── Backfill (re-runnable, batched per client) ───────────────────────────────

-- Links up to p_limit unlinked events for one client, lead events first, then
-- by date. Only writes events.lead_id. Returns rows linked in this call.
create or replace function public.backfill_event_leads(p_client_id uuid, p_limit int default 5000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_lead  uuid;
  v_n     int := 0;
  v_seen  uuid[] := '{}';
begin
  perform set_config('leads.skip_refresh', 'on', true);

  for r in
    select id, client_id, ghl_contact_id, lead_phone, lead_email, lead_name, event_type,
           case when jsonb_typeof(raw) = 'object' then raw ->> 'source' end as src,
           occurred_at
    from events
    where client_id = p_client_id and lead_id is null
    order by (event_type = 'lead') desc, occurred_at, id
    limit p_limit
  loop
    v_lead := resolve_lead(
      r.client_id, r.ghl_contact_id, r.lead_phone, r.lead_email, r.lead_name,
      r.event_type, r.src, r.occurred_at
    );
    if v_lead is not null then
      update events set lead_id = v_lead where id = r.id;
      v_seen := v_seen || v_lead;
      v_n := v_n + 1;
    end if;
  end loop;

  perform refresh_lead(x) from (select distinct unnest(v_seen) as x) s;
  perform set_config('leads.skip_refresh', 'off', true);
  return v_n;
end;
$$;

create or replace function public.backfill_loan_deal_leads()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  with linked as (
    update loan_deals d
    set lead_id = coalesce(
      (select e.lead_id from events e where e.id = d.conversion_event_id),
      resolve_lead(
        d.client_id, d.ghl_contact_id, d.lead_phone, d.lead_email, d.lead_name,
        'loan_deal', d.source, d.submitted_at
      )
    )
    where d.lead_id is null
    returning d.lead_id
  )
  select count(*) into v_n from linked;

  perform refresh_lead(lead_id)
  from (select distinct lead_id from loan_deals where lead_id is not null) s;
  return v_n;
end;
$$;

-- ── Access ───────────────────────────────────────────────────────────────────

alter table leads enable row level security;
alter table lead_identities enable row level security;
alter table lead_identity_reviews enable row level security;
alter table lead_merges enable row level security;

do $$ begin
  create policy leads_read on leads for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy lead_identities_read on lead_identities for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy lead_identity_reviews_read on lead_identity_reviews for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy lead_merges_read on lead_merges for select to authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on leads, lead_identities, lead_identity_reviews, lead_merges to authenticated;
grant all on leads, lead_identities, lead_identity_reviews, lead_merges to service_role;

revoke execute on function public.resolve_lead(uuid, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.refresh_lead(uuid) from public, anon, authenticated;
revoke execute on function public.lead_attach_identity(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.backfill_event_leads(uuid, int) from public, anon, authenticated;
revoke execute on function public.backfill_loan_deal_leads() from public, anon, authenticated;
