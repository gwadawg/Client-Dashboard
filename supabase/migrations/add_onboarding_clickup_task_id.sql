alter table clients
  add column if not exists onboarding_clickup_task_id text;

create unique index if not exists clients_onboarding_clickup_task_id_key
  on clients (onboarding_clickup_task_id)
  where onboarding_clickup_task_id is not null;
