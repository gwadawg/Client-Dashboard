-- Handoff flag: creatives the media buyer should launch next.
-- Independent of status (active / winner / paused / archived).
alter table ad_library
  add column if not exists ready_to_test boolean not null default false;

create index if not exists ad_library_ready_to_test_idx
  on ad_library (created_at desc)
  where ready_to_test = true;

comment on column ad_library.ready_to_test is
  'Opt-in handoff: show in Media Buyer Ready to test list until cleared.';
