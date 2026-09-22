-- GHL subaccount phone used for prospecting (virtual card, outbound).
-- Distinct from clients.phone (LO personal contact) and phone_live_transfer.
alter table clients add column if not exists phone_ghl text;

comment on column clients.phone_ghl is
  'Go High Level phone number for this subaccount — the number we prospect with (virtual card, SMS, etc.).';
