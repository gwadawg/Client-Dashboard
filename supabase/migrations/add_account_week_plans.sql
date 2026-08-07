-- Spec: Wm-os docs/superpowers/specs/2026-08-06-account-week-plans-design.md

CREATE TABLE IF NOT EXISTS account_week_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  week_start          date NOT NULL,
  why                 text NOT NULL DEFAULT '',
  severity            text,
  status              text NOT NULL DEFAULT 'pending',
  success_signal      text,
  origin_meeting_id   uuid REFERENCES team_meeting_instances(id) ON DELETE SET NULL,
  approved_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  founder_note        text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_week_plans_severity_check CHECK (
    severity IS NULL OR severity IN ('911', 'below', 'watch')
  ),
  CONSTRAINT account_week_plans_status_check CHECK (
    status IN ('pending', 'approved', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS account_week_plans_client_week_idx
  ON account_week_plans (client_id, week_start DESC);

CREATE INDEX IF NOT EXISTS account_week_plans_status_idx
  ON account_week_plans (status);

CREATE INDEX IF NOT EXISTS account_week_plans_week_status_idx
  ON account_week_plans (week_start, status);

CREATE INDEX IF NOT EXISTS account_week_plans_origin_meeting_idx
  ON account_week_plans (origin_meeting_id)
  WHERE origin_meeting_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_week_plans_pending_idx
  ON account_week_plans (status)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS account_plan_tasks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                uuid NOT NULL REFERENCES account_week_plans(id) ON DELETE CASCADE,
  client_id              uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title                  text NOT NULL,
  notes                  text,
  tactic_tag             text,
  assignee_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_for          date,
  status                 text NOT NULL DEFAULT 'open',
  completion_report      text,
  completed_at           timestamptz,
  completed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_action_log_id   uuid REFERENCES client_action_logs(id) ON DELETE SET NULL,
  sort_order             int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_plan_tasks_status_check CHECK (
    status IN ('open', 'done', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS account_plan_tasks_assignee_day_idx
  ON account_plan_tasks (assignee_user_id, scheduled_for);

CREATE INDEX IF NOT EXISTS account_plan_tasks_client_created_idx
  ON account_plan_tasks (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_plan_tasks_plan_sort_idx
  ON account_plan_tasks (plan_id, sort_order);

CREATE INDEX IF NOT EXISTS account_plan_tasks_status_idx
  ON account_plan_tasks (status);

CREATE INDEX IF NOT EXISTS account_plan_tasks_open_assignee_day_idx
  ON account_plan_tasks (assignee_user_id, scheduled_for)
  WHERE status = 'open';
