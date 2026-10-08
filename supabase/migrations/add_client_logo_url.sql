-- Company mark used by the DSCR landing form. Public URL, same pattern as headshot_url.
alter table clients add column if not exists logo_url text;
