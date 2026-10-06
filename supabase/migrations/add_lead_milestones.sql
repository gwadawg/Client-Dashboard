-- Lead milestones: conversation → proposal → submission → funded, one date each
-- per lead, rolled up from that lead's events and loan_deals. Writes leads only.
-- Design: docs/superpowers/specs/2026-10-02-lead-entity-design.md (Derived milestones)
--
-- Real dates win. A stage with no real date is filled only when a later stage
-- exists, at 15 days before the next stage, never earlier than the lead's first
-- non-form activity or an earlier real stage. Loan-log same-day fillers count
-- as empty.

set local lock_timeout = '5s';

alter table leads add column if not exists conversation_at     timestamptz;
alter table leads add column if not exists conversation_source text;
alter table leads add column if not exists proposal_at         timestamptz;
alter table leads add column if not exists proposal_implied    boolean not null default false;
alter table leads add column if not exists submission_at       timestamptz;
alter table leads add column if not exists submission_implied  boolean not null default false;
alter table leads add column if not exists funded_at           timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_conversation_source_check' and conrelid = 'public.leads'::regclass
  ) then
    alter table leads add constraint leads_conversation_source_check check (
      conversation_source in ('show', 'live_transfer', 'claimed', 'implied_show', 'implied_claimed')
    );
  end if;
end $$;

create index if not exists leads_client_conversation_idx
  on leads (client_id, conversation_at) where conversation_at is not null;
create index if not exists leads_client_proposal_idx
  on leads (client_id, proposal_at) where proposal_at is not null;
create index if not exists leads_client_submission_idx
  on leads (client_id, submission_at) where submission_at is not null;
create index if not exists leads_client_funded_idx
  on leads (client_id, funded_at) where funded_at is not null;

create or replace function public.event_form_source(p_raw jsonb)
returns text
language sql
immutable
as $$
  select coalesce(case when jsonb_typeof(p_raw) = 'object' then p_raw ->> 'source' end, '')
$$;

create or replace function public.refresh_lead(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gap        constant interval := interval '15 days';
  v_first_lead record;
  v_ad         record;
  v_source     text;
  v_seen       timestamptz;
  v_deal_seen  timestamptz;
  v_floor      timestamptz;
  v_real_conv  timestamptz;
  v_conv_type  text;
  v_real_prop  timestamptz;
  v_real_sub   timestamptz;
  v_real_fund  timestamptz;
  v_conv       timestamptz;
  v_conv_src   text;
  v_prop       timestamptz;
  v_sub        timestamptz;
  v_next       timestamptz;
  v_first_stage timestamptz;
  v_appt       timestamptz;
begin
  if p_lead is null then
    return;
  end if;

  -- Identity and first-touch attribution
  select id, occurred_at, lead_name into v_first_lead
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

  -- Earliest activity not typed in by a client form: implied dates never go earlier.
  select min(occurred_at) into v_floor
  from events
  where lead_id = p_lead
    and event_form_source(raw) not in ('loan_log_form', 'client_log_form');

  -- Real stage dates
  select occurred_at, event_type into v_real_conv, v_conv_type
  from events
  where lead_id = p_lead
    and event_type in ('show', 'live_transfer', 'claimed')
    and not (event_type = 'claimed' and event_form_source(raw) = 'loan_log_form')
  order by occurred_at, id
  limit 1;

  select min(occurred_at) into v_real_prop
  from events
  where lead_id = p_lead
    and event_type in ('proposal_made', 'proposal_sent')
    and not (event_form_source(raw) = 'loan_log_form' and not (raw ? 'loan_size'));

  select least(
    (select min(occurred_at) from events
     where lead_id = p_lead
       and event_type in ('loan_funded', 'closed')),
    (select min(funded_at) from loan_deals where lead_id = p_lead)
  ) into v_real_fund;

  select least(
    (select min(s.occurred_at) from events s
     where s.lead_id = p_lead
       and s.event_type in ('submission_made', 'loan_processing')
       and not (
         event_form_source(s.raw) = 'loan_log_form'
         and exists (
           select 1 from events f
           where f.lead_id = p_lead
             and f.event_type in ('loan_funded', 'closed')
             and event_form_source(f.raw) = 'loan_log_form'
             and f.occurred_at = s.occurred_at
         )
       )),
    (select min(submitted_at) from loan_deals
     where lead_id = p_lead
       and not (stage = 'funded' and funded_at = submitted_at))
  ) into v_real_sub;

  -- Fill top-down: each missing stage trails the next one by 15 days.
  if v_real_sub is not null then
    v_sub := v_real_sub;
  elsif v_real_fund is not null then
    v_sub := least(v_real_fund, greatest(v_real_fund - v_gap, v_floor, v_real_conv, v_real_prop));
  end if;

  if v_real_prop is not null then
    v_prop := v_real_prop;
  else
    v_next := coalesce(v_sub, v_real_fund);
    if v_next is not null then
      v_prop := least(v_next, greatest(v_next - v_gap, v_floor, v_real_conv));
    end if;
  end if;

  if v_real_conv is not null then
    v_conv := v_real_conv;
    v_conv_src := v_conv_type;
  else
    v_first_stage := least(v_prop, v_sub, v_real_fund);
    if v_first_stage is not null then
      -- Latest appointment held on or before the first stage that was not
      -- marked no-show, bailed, or cancelled.
      select coalesce(b.scheduled_at, b.occurred_at) into v_appt
      from events b
      where b.lead_id = p_lead
        and b.event_type = 'appointment_booked'
        and coalesce(b.scheduled_at, b.occurred_at) <= v_first_stage
        and not exists (
          select 1 from events o
          where o.lead_id = p_lead
            and o.event_type in ('no_show', 'lo_bailed', 'appointment_cancelled')
            and b.external_id is not null
            and o.external_id = b.external_id
        )
      order by coalesce(b.scheduled_at, b.occurred_at) desc
      limit 1;

      if v_appt is not null then
        v_conv := v_appt;
        v_conv_src := 'implied_show';
      else
        v_conv := least(v_first_stage, greatest(v_first_stage - v_gap, v_floor));
        v_conv_src := 'implied_claimed';
      end if;
    end if;
  end if;

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
    conversation_at     = v_conv,
    conversation_source = v_conv_src,
    proposal_at         = v_prop,
    proposal_implied    = v_prop is not null and v_real_prop is null,
    submission_at       = v_sub,
    submission_implied  = v_sub is not null and v_real_sub is null,
    funded_at           = v_real_fund,
    updated_at          = now()
  where l.id = p_lead;
end;
$$;

revoke execute on function public.refresh_lead(uuid) from public, anon, authenticated;

-- Appointment outcomes change the implied conversation; external_id links them.
drop trigger if exists events_refresh_lead_update on events;
create trigger events_refresh_lead_update
  after update on events
  for each row
  when (
    old.lead_id is distinct from new.lead_id
    or old.occurred_at is distinct from new.occurred_at
    or old.scheduled_at is distinct from new.scheduled_at
    or old.external_id is distinct from new.external_id
    or old.event_type is distinct from new.event_type
    or old.utm_content is distinct from new.utm_content
    or old.ad_name is distinct from new.ad_name
    or old.lead_source is distinct from new.lead_source
    or old.raw is distinct from new.raw
  )
  execute function trg_events_refresh_lead();

-- Loan deal dates feed submission / funded.
create or replace function public.trg_loan_deals_refresh_lead()
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
    raise warning 'refresh_lead (loan_deals) failed: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists loan_deals_refresh_lead on loan_deals;
create trigger loan_deals_refresh_lead
  after insert or update or delete on loan_deals
  for each row execute function trg_loan_deals_refresh_lead();

-- Re-runnable full refresh in id order. Returns how many leads were refreshed.
create or replace function public.refresh_leads_batch(p_after uuid, p_limit int default 5000)
returns table (refreshed int, last_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in
    select id from leads
    where p_after is null or id > p_after
    order by id
    limit p_limit
  loop
    perform refresh_lead(v_id);
    v_n := v_n + 1;
    last_id := v_id;
  end loop;
  refreshed := v_n;
  return next;
end;
$$;

revoke execute on function public.refresh_leads_batch(uuid, int) from public, anon, authenticated;
