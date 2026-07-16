-- Add interview call type for team hiring / candidate calls.

alter table team_calls drop constraint if exists team_calls_type_check;
alter table team_calls add constraint team_calls_type_check check (
  call_type in (
    'coaching',
    'training',
    'team_meeting',
    'team_review',
    'interview',
    'role_play',
    '1on1',
    'sales_review',
    'other'
  )
);
