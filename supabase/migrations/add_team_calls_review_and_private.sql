-- Add Team Review call type + private (creator-only) visibility for team_calls.

alter table team_calls drop constraint if exists team_calls_type_check;
alter table team_calls add constraint team_calls_type_check check (
  call_type in (
    'coaching',
    'team_meeting',
    'team_review',
    'role_play',
    'training',
    '1on1',
    'sales_review',
    'other'
  )
);

alter table team_calls
  add column if not exists is_private boolean not null default false;

create index if not exists team_calls_private_created_by
  on team_calls (created_by)
  where is_private = true and deleted_at is null;

comment on column team_calls.is_private is
  'When true, only the creating user can see this call in the Team Calls library.';
