-- Setter-facing blurb: what this client is advertising (shown in State Looker / client directory).
alter table clients add column if not exists offer_summary text;

comment on column clients.offer_summary is
  'Brief description of the service/offer this client is advertising; safe for setter-facing directory.';
