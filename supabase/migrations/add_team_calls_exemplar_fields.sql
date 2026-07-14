-- Exemplar dial fields for the Call Library (save from Recordings).
-- lead_type: RM / DSCR / HE (coaching vocabulary; HE = home-equity / call-center leads)
-- grade: A+ / A / A- / B for curated "good call" examples
-- source_event_id: optional link back to the dial event that was saved

alter table team_calls
  add column if not exists lead_type text,
  add column if not exists grade text,
  add column if not exists source_event_id uuid references events(id) on delete set null;

alter table team_calls
  drop constraint if exists team_calls_lead_type_check;
alter table team_calls
  add constraint team_calls_lead_type_check
  check (lead_type is null or lead_type in ('RM', 'DSCR', 'HE'));

alter table team_calls
  drop constraint if exists team_calls_grade_check;
alter table team_calls
  add constraint team_calls_grade_check
  check (grade is null or grade in ('A+', 'A', 'A-', 'B'));

-- One library entry per source dial (when linked)
create unique index if not exists team_calls_source_event_unique
  on team_calls (source_event_id)
  where source_event_id is not null and deleted_at is null;

create index if not exists team_calls_lead_type on team_calls (lead_type)
  where lead_type is not null and deleted_at is null;

create index if not exists team_calls_grade on team_calls (grade)
  where grade is not null and deleted_at is null;

comment on column team_calls.lead_type is 'Product line for exemplar dials: RM, DSCR, or HE';
comment on column team_calls.grade is 'Quality grade for curated examples: A+, A, A-, B';
comment on column team_calls.source_event_id is 'Dial event this library entry was saved from (Recordings browser)';
