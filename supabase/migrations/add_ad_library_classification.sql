-- Ad format + product classification for the media buyer library.
alter table ad_library
  add column if not exists ad_format text,
  add column if not exists product text;

alter table ad_library drop constraint if exists ad_library_ad_format_check;
alter table ad_library add constraint ad_library_ad_format_check check (
  ad_format is null or ad_format in ('static', 'ugc', 'testimonial', 'ext')
);

alter table ad_library drop constraint if exists ad_library_product_check;
alter table ad_library add constraint ad_library_product_check check (
  product is null or product in ('reverse', 'dscr', 'broad_forward')
);

create index if not exists ad_library_ad_format_idx on ad_library(ad_format);
create index if not exists ad_library_product_idx on ad_library(product);
