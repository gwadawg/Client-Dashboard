-- Unique per-client token for the public team-member invite form.
-- Link: /onboard/team/<token> → inserts into client_contacts for that client.

alter table clients add column if not exists team_invite_token text;

create unique index if not exists clients_team_invite_token_uidx
  on clients(team_invite_token)
  where team_invite_token is not null;
