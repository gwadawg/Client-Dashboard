-- One manual_dq per contact per client (when ghl_contact_id is known).
create unique index if not exists events_manual_dq_contact_uidx
  on events (client_id, ghl_contact_id)
  where event_type = 'manual_dq' and ghl_contact_id is not null;
