-- Relabel sales packages for ops clarity (codes unchanged).
-- core_offer → Call Center (Waiz dials)
-- mid_offer  → Leads Only (client dials)

update offer_catalog
set
  label = 'Call Center',
  short_label = 'CC',
  description = 'Full service: ads, dial, book, and qualify (Waiz call center)',
  ghl_aliases = array[
    'Call Center', 'call center',
    'Core Offer', 'core offer',
    'Full Service', 'full service', 'RM'
  ]
where kind = 'sales_package' and code = 'core_offer';

update offer_catalog
set
  label = 'Leads Only',
  short_label = 'Leads',
  description = 'Lead gen only — client handles dial, booking, and qualification',
  ghl_aliases = array[
    'Leads Only', 'leads only', 'Leads', 'leads',
    'Mid Offer', 'mid offer',
    'Lead Gen', 'lead gen'
  ]
where kind = 'sales_package' and code = 'mid_offer';
