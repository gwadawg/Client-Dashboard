-- Mark team calls as important for quick revisit filtering.

alter table public.team_calls
  add column if not exists is_important boolean not null default false;

create index if not exists team_calls_important
  on public.team_calls (called_at desc)
  where is_important = true and deleted_at is null;

comment on column public.team_calls.is_important is
  'When true, call is pinned for easy finding via the Important filter.';
