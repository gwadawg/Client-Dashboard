-- Team / coaching call library — curated archive with transcripts, tags, and highlight moments.
-- Viewing gated by 'call_library' permission; mutations admin/owner only (app code).

create table if not exists team_calls (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  call_type        text not null,
  called_at        timestamptz not null,
  participants     text,
  recording_url    text,
  transcript       text,
  summary          text,
  highlights       jsonb not null default '[]',
  highlights_text  text,
  tags             text[] not null default '{}',
  duration_seconds int,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  search_vector    tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(transcript, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(participants, '') || ' ' ||
      coalesce(highlights_text, '')
    )
  ) stored,
  constraint team_calls_type_check check (
    call_type in ('coaching', 'team_meeting', 'role_play', 'training', '1on1', 'sales_review', 'other')
  )
);

create index if not exists team_calls_search on team_calls using gin(search_vector);
create index if not exists team_calls_tags on team_calls using gin(tags);
create index if not exists team_calls_called_at on team_calls(called_at desc);
create index if not exists team_calls_call_type on team_calls(call_type);

comment on table team_calls is 'Curated team/coaching call library with searchable transcripts and timestamped highlights.';
comment on column team_calls.highlights is 'JSON array: [{ at_seconds, label, takeaway }]';
comment on column team_calls.highlights_text is 'Denormalized highlight text for full-text search; built on write.';
