-- dial_id unique index is for form-documented calls (intro/demo/closer), not dial_ingest mirrors.
-- Clear mirror rows so closers/setters can link the same GHL call on their form submit.

update acquisition_calls
set
  dial_id = null,
  updated_at = now()
where call_type = 'dial'
  and dial_id is not null;
