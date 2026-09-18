-- Media buying account ops fields (Meta page, ad account, landers).
-- Landing page continues to use clients.funnel_url.
alter table clients add column if not exists instagram_handle text;
alter table clients add column if not exists ad_account_name text;
alter table clients add column if not exists ad_account_url text;
alter table clients add column if not exists thank_you_page_url text;
alter table clients add column if not exists second_landing_page_url text;

comment on column clients.instagram_handle is
  'Instagram handle or page label for this client account.';
comment on column clients.ad_account_name is
  'Meta Ads Manager ad account display name.';
comment on column clients.ad_account_url is
  'Direct link into Meta Ads Manager for this ad account.';
comment on column clients.thank_you_page_url is
  'Primary thank-you / confirmation page URL (free text if multiple).';
comment on column clients.second_landing_page_url is
  'Secondary landing page URL when the client has more than one funnel.';
