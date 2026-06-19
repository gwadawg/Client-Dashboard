-- Store GHL call recording links on acquisition dial rows (Make → /api/acquisition/webhooks/dial).

alter table acquisition_dials
  add column if not exists recording_url text;

create index if not exists acquisition_dials_recording_url_idx
  on acquisition_dials (occurred_at desc)
  where recording_url is not null;
