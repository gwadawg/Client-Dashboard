-- Allow GHL default contact source "Unknown" on acquisition_leads.

alter table acquisition_leads drop constraint if exists acquisition_leads_source_check;
alter table acquisition_leads add constraint acquisition_leads_source_check check (
  source is null or source in ('organic', 'Meta', 'Referral', 'Cold', 'Unknown')
);
