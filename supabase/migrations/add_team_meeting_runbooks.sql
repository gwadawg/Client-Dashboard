-- Team meeting runbooks: recurring templates + scheduled instances.
-- Spec: Wm-os docs/plans/2026-07-21-team-call-runbooks-design.md
-- Scheduling wall-clock times are America/Sao_Paulo (CALL_CENTER_TIMEZONE).

CREATE TABLE IF NOT EXISTS team_meeting_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  theme           text NOT NULL DEFAULT '',
  call_type       text NOT NULL,
  weekdays        int[] NOT NULL DEFAULT '{}',
  -- empty weekdays = Mon–Fri (1..5); else ISO weekday 1=Mon .. 7=Sun
  default_time    time NOT NULL,
  duration_min    int NOT NULL DEFAULT 30,
  host_role       text NOT NULL,
  attendee_roles  text[] NOT NULL DEFAULT '{}',
  agenda_md       text NOT NULL DEFAULT '',
  checklist       jsonb NOT NULL DEFAULT '[]'::jsonb,
  disposition     jsonb NOT NULL DEFAULT '[]'::jsonb,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_meeting_templates_call_type_check CHECK (
    call_type IN (
      'coaching', 'training', 'team_meeting', 'team_review',
      'interview', 'role_play', '1on1', 'sales_review', 'other'
    )
  ),
  CONSTRAINT team_meeting_templates_host_role_check CHECK (
    host_role IN ('ccm', 'client_success', 'ceo', 'shared')
  )
);

CREATE TABLE IF NOT EXISTS team_meeting_instances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL
    REFERENCES team_meeting_templates(id) ON DELETE CASCADE,
  scheduled_at      timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'scheduled',
  host_agent_id     uuid REFERENCES agents(id) ON DELETE SET NULL,
  checklist_state   jsonb NOT NULL DEFAULT '{}'::jsonb,
  responses         jsonb NOT NULL DEFAULT '{}'::jsonb,
  recording_url     text,
  notes             text,
  team_call_id      uuid REFERENCES team_calls(id) ON DELETE SET NULL,
  completed_at      timestamptz,
  completed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_meeting_instances_status_check CHECK (
    status IN (
      'scheduled', 'in_progress', 'completed', 'skipped', 'cancelled'
    )
  ),
  CONSTRAINT team_meeting_instances_unique_slot
    UNIQUE (template_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS team_meeting_instances_scheduled_at_idx
  ON team_meeting_instances (scheduled_at);

CREATE INDEX IF NOT EXISTS team_meeting_instances_status_idx
  ON team_meeting_instances (status);
