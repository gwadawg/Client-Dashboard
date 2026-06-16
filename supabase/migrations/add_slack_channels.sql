-- Workspace Slack channels + future notification automations (phase 1: storage only).

create table if not exists slack_channels (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  label        text not null,
  channel_id   text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  constraint slack_channels_slug_check check (char_length(trim(slug)) > 0),
  constraint slack_channels_label_check check (char_length(trim(label)) > 0),
  constraint slack_channels_channel_id_check check (char_length(trim(channel_id)) > 0)
);

create index if not exists slack_channels_active on slack_channels(is_active) where is_active = true;

create table if not exists notification_automations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  event_key         text not null,
  target_type       text not null,
  slack_channel_id  uuid references slack_channels(id) on delete set null,
  is_enabled        boolean not null default false,
  config            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint notification_automations_name_check check (char_length(trim(name)) > 0),
  constraint notification_automations_event_key_check check (char_length(trim(event_key)) > 0),
  constraint notification_automations_target_type_check check (
    target_type in ('workspace_channel', 'client_channel')
  )
);

create index if not exists notification_automations_event_key on notification_automations(event_key);
create index if not exists notification_automations_enabled on notification_automations(is_enabled) where is_enabled = true;
