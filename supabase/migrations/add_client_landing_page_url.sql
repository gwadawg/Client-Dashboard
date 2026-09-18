-- Built landing page (agency-built lander, e.g. homequityhacks).
-- Distinct from clients.website (personal site) and clients.funnel_url (Perspective entry).
alter table clients add column if not exists landing_page_url text;

comment on column clients.landing_page_url is
  'Agency-built landing page URL (separate from personal website and Perspective funnel).';
comment on column clients.website is
  'Client personal / company website URL.';
comment on column clients.funnel_url is
  'Perspective (or primary) funnel entry URL used in ads.';
comment on column clients.thank_you_page_url is
  'Post-submit thank-you page URL (may be outside Perspective).';

-- Remap CSV-era landers that were stored on funnel_url into landing_page_url.
-- Only move homequityhacks URLs; leave other funnel_url values as Perspective.
update clients
set
  landing_page_url = funnel_url,
  funnel_url = null
where landing_page_url is null
  and funnel_url is not null
  and funnel_url ilike '%homequityhacks%';
