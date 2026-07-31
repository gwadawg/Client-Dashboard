-- Ensure every client has a public report share token.
update clients
set share_token = encode(gen_random_bytes(16), 'hex')
where share_token is null or btrim(share_token) = '';

alter table clients
  alter column share_token set default encode(gen_random_bytes(16), 'hex');

create unique index if not exists clients_share_token_uid
  on clients (share_token)
  where share_token is not null;
