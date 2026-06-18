-- Speed up Sales Calls tab: documented calls only (form_submission_id present).

create index if not exists acquisition_calls_documented_called_idx
  on acquisition_calls (called_at desc)
  where form_submission_id is not null
    and call_type <> 'dial';
