-- Offer catalog: products (verticals) and sales packages for acquisition + roster reporting.

create table if not exists offer_catalog (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('product', 'sales_package')),
  code          text not null,
  label         text not null,
  short_label   text,
  description   text,
  color         text,
  background    text,
  ghl_aliases   text[] not null default '{}',
  applies_to    text[] not null default '{}',
  is_downsell   boolean not null default false,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (kind, code)
);

create index if not exists idx_offer_catalog_kind_active
  on offer_catalog (kind, is_active, sort_order);

-- Seed products
insert into offer_catalog (kind, code, label, short_label, description, color, background, ghl_aliases, sort_order)
values
  ('product', 'RM', 'Reverse', 'RM',
   'Marketing reverse mortgages (ads + pipeline + call center)',
   '#38bdf8', 'rgba(56,189,248,0.14)',
   array['RM', 'Reverse', 'reverse', 'Reverse Mortgage', 'reverse mortgage', 'REVERSE'],
   1),
  ('product', 'DSCR', 'DSCR', 'DSCR',
   'Marketing DSCR loans (ads + pipeline + call center)',
   '#fbbf24', 'rgba(251,191,36,0.14)',
   array['DSCR', 'dscr'],
   2),
  ('product', 'CALL_CENTER', 'Call Center Lead', 'CC',
   'Dialing the LO''s existing leads — no ad-gen motion',
   '#a78bfa', 'rgba(167,139,250,0.14)',
   array['CALL_CENTER', 'Call Center', 'call center', 'CC', 'HE', 'Home Equity'],
   3)
on conflict (kind, code) do nothing;

-- Seed sales packages
insert into offer_catalog (kind, code, label, short_label, description, ghl_aliases, applies_to, is_downsell, is_active, sort_order)
values
  ('sales_package', 'core_offer', 'Core Offer', 'Core',
   'Full service: ads, dial, book, and qualify',
   array['Core Offer', 'core offer', 'Full Service', 'full service', 'RM'],
   array['RM', 'DSCR', 'CALL_CENTER'],
   false, true, 1),
  ('sales_package', 'mid_offer', 'Mid Offer', 'Mid',
   'Lead gen only — client handles dial, booking, and qualification',
   array['Mid Offer', 'mid offer'],
   array['RM', 'DSCR'],
   false, true, 2),
  ('sales_package', 'skool', 'Skool', 'Skool',
   'Reverse downsell — Skool community',
   array['Skool', 'skool'],
   array['RM'],
   true, true, 3),
  ('sales_package', 'bootcamp', 'Bootcamp', 'Bootcamp',
   'Legacy downsell — inactive for new closes',
   array['Bootcamp', 'bootcamp'],
   array[]::text[],
   true, false, 4)
on conflict (kind, code) do nothing;

-- Persist sales package on clients for roster reporting without joining acquisition.
alter table clients
  add column if not exists sales_package text;

-- Backfill acquisition offer_type from display labels to stable codes.
update acquisition_offers set offer_type = 'core_offer'
  where lower(trim(offer_type)) in ('core offer', 'full service', 'rm');

update acquisition_offers set offer_type = 'mid_offer'
  where lower(trim(offer_type)) = 'mid offer';

update acquisition_offers set offer_type = 'skool'
  where lower(trim(offer_type)) = 'skool';

update acquisition_offers set offer_type = 'bootcamp'
  where lower(trim(offer_type)) = 'bootcamp';

update acquisition_closes set offer_type = 'core_offer'
  where lower(trim(offer_type)) in ('core offer', 'full service', 'rm');

update acquisition_closes set offer_type = 'mid_offer'
  where lower(trim(offer_type)) = 'mid offer';

update acquisition_closes set offer_type = 'skool'
  where lower(trim(offer_type)) = 'skool';

update acquisition_closes set offer_type = 'bootcamp'
  where lower(trim(offer_type)) = 'bootcamp';

-- Backfill clients.sales_package from linked closes.
update clients c
set sales_package = ac.offer_type
from acquisition_closes ac
where ac.client_id = c.id
  and ac.offer_type is not null
  and c.sales_package is null;

-- Derive service_program from sales_package where missing.
update clients
set service_program = 'core'
where sales_package = 'core_offer'
  and reporting_type in ('RM', 'DSCR')
  and (service_program is null or service_program = '');

update clients
set service_program = 'lead_gen'
where sales_package = 'mid_offer'
  and reporting_type in ('RM', 'DSCR')
  and (service_program is null or service_program = '');
