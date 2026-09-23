-- Fix product vs package "Call Center" collision.
-- Product CALL_CENTER (form: HE) must not share the bare "Call Center" alias
-- with sales package core_offer (form: Offer = Call Center).

update offer_catalog
set
  label = 'HE',
  short_label = 'HE',
  description = 'Dialing the LO''s existing leads — no ad-gen motion',
  ghl_aliases = array[
    'HE', 'Home Equity', 'home equity',
    'CALL_CENTER', 'Call Center Lead', 'call center lead', 'CC Lead'
  ]
where kind = 'product' and code = 'CALL_CENTER';

update offer_catalog
set
  ghl_aliases = array[
    'Call Center', 'call center',
    'Core Offer', 'core offer',
    'Full Service', 'full service',
    'core_offer'
  ]
where kind = 'sales_package' and code = 'core_offer';
