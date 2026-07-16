-- Align live team_calls with the Call Library app schema.
-- The table was originally created by add_call_intelligence.sql (notes/attendees),
-- so create table if not exists in add_team_calls.sql was a no-op — inserts of
-- title/participants/summary/highlights/tags were failing.

alter table public.team_calls add column if not exists title text;
alter table public.team_calls add column if not exists participants text;
alter table public.team_calls add column if not exists summary text;
alter table public.team_calls add column if not exists highlights jsonb not null default '[]'::jsonb;
alter table public.team_calls add column if not exists highlights_text text;
alter table public.team_calls add column if not exists tags text[] not null default '{}'::text[];

update public.team_calls
set participants = attendees
where participants is null and attendees is not null;

update public.team_calls
set summary = notes
where summary is null and notes is not null;

update public.team_calls
set title = coalesce(
  nullif(trim(title), ''),
  nullif(trim(summary), ''),
  nullif(trim(call_type), ''),
  'Untitled'
)
where title is null or trim(title) = '';

alter table public.team_calls alter column title set not null;

-- Rebuild FTS column to include library fields (and keep legacy notes/attendees).
alter table public.team_calls drop column if exists search_vector;
alter table public.team_calls add column search_vector tsvector generated always as (
  to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(transcript, '') || ' ' ||
    coalesce(summary, '') || ' ' ||
    coalesce(notes, '') || ' ' ||
    coalesce(participants, '') || ' ' ||
    coalesce(attendees, '') || ' ' ||
    coalesce(highlights_text, '')
  )
) stored;

create index if not exists team_calls_search on public.team_calls using gin(search_vector);
create index if not exists team_calls_tags on public.team_calls using gin(tags);
create index if not exists team_calls_called_at on public.team_calls(called_at desc);
create index if not exists team_calls_call_type on public.team_calls(call_type);

comment on column public.team_calls.title is 'Display title for the curated Team Calls library entry';
comment on column public.team_calls.participants is 'Free-text participants list (preferred over legacy attendees)';
comment on column public.team_calls.summary is 'Call summary / takeaways (preferred over legacy notes)';
comment on column public.team_calls.highlights is 'JSON array: [{ at_seconds, label, takeaway }]';
comment on column public.team_calls.highlights_text is 'Denormalized highlight text for full-text search; built on write';
comment on column public.team_calls.tags is 'Searchable tags for the Team Calls library';

-- Prefer new participants column in the unified calls view when present.
-- Definition otherwise matches the live v_all_calls (call intelligence sync migration).
create or replace view public.v_all_calls as
  select
    c.id as call_id,
    'acquisition'::text as call_domain,
    'sales_acquisition'::text as call_category,
    c.call_type as call_subtype,
    c.called_at,
    trim(both ' ' from coalesce(c.handled_by, '')
      || coalesce(' + ' || nullif(c.co_handler, ''), '')) as participants,
    c.recording_url,
    c.transcript,
    c.transcript_url,
    ci.transcript_summary,
    ci.extraction,
    coalesce(ci.content_eligible, public.has_call_transcript(c.transcript)) as content_eligible,
    coalesce(ci.lanes, array['business'::text, 'acquisition'::text]) as lanes,
    coalesce(ci.sensitivity, 'internal'::text) as sensitivity,
    case
      when not public.has_call_transcript(c.transcript) then 'skipped'::text
      else coalesce(ci.knowledge_capture_status, 'pending'::text)
    end as knowledge_capture_status,
    ci.knowledge_capture_at,
    coalesce(ci.os_refs, '{}'::text[]) as os_refs,
    c.client_id,
    c.lead_id,
    null::uuid as team_call_id
  from public.acquisition_calls c
  left join public.call_intelligence ci
    on ci.call_domain = 'acquisition' and ci.call_id = c.id

  union all

  select
    cc.id as call_id,
    'client'::text as call_domain,
    'client_fulfillment'::text as call_category,
    cc.call_type as call_subtype,
    cc.called_at,
    cc.attendees as participants,
    cc.recording_url,
    cc.transcript,
    null::text as transcript_url,
    ci.transcript_summary,
    ci.extraction,
    coalesce(ci.content_eligible, public.has_call_transcript(cc.transcript)) as content_eligible,
    coalesce(ci.lanes, array['client'::text]) as lanes,
    coalesce(ci.sensitivity, 'client_confidential'::text) as sensitivity,
    case
      when not public.has_call_transcript(cc.transcript) then 'skipped'::text
      else coalesce(ci.knowledge_capture_status, 'pending'::text)
    end as knowledge_capture_status,
    ci.knowledge_capture_at,
    coalesce(ci.os_refs, '{}'::text[]) as os_refs,
    cc.client_id,
    null::uuid as lead_id,
    null::uuid as team_call_id
  from public.client_calls cc
  left join public.call_intelligence ci
    on ci.call_domain = 'client' and ci.call_id = cc.id
  where cc.deleted_at is null

  union all

  select
    tc.id as call_id,
    'team'::text as call_domain,
    'team_internal'::text as call_category,
    tc.call_type as call_subtype,
    tc.called_at,
    coalesce(tc.participants, tc.attendees) as participants,
    tc.recording_url,
    tc.transcript,
    null::text as transcript_url,
    ci.transcript_summary,
    ci.extraction,
    coalesce(ci.content_eligible, public.has_call_transcript(tc.transcript)) as content_eligible,
    coalesce(ci.lanes, '{}'::text[]) as lanes,
    coalesce(ci.sensitivity, 'internal'::text) as sensitivity,
    case
      when not public.has_call_transcript(tc.transcript) then 'skipped'::text
      else coalesce(ci.knowledge_capture_status, 'pending'::text)
    end as knowledge_capture_status,
    ci.knowledge_capture_at,
    coalesce(ci.os_refs, '{}'::text[]) as os_refs,
    null::uuid as client_id,
    null::uuid as lead_id,
    tc.id as team_call_id
  from public.team_calls tc
  left join public.call_intelligence ci
    on ci.call_domain = 'team' and ci.call_id = tc.id
  where tc.deleted_at is null;

grant select on public.v_all_calls to service_role;
grant select on public.v_all_calls to authenticated;
