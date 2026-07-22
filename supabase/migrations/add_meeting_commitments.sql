-- Structured commitments for Mon/Thu KPI + Ops Needs Founder.
-- Spec: Wm-os docs/superpowers/specs/2026-07-22-kpi-meeting-commitments-design.md

CREATE TABLE IF NOT EXISTS meeting_commitments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  severity                text NOT NULL,
  why                     text NOT NULL DEFAULT '',
  constraint_type         text NOT NULL,
  constraint_label        text NOT NULL DEFAULT '',
  plan                    text NOT NULL DEFAULT '',
  owner_role              text NOT NULL,
  due_date                date NOT NULL,
  needs_founder           boolean NOT NULL DEFAULT false,
  founder_ask             text,
  status                  text NOT NULL DEFAULT 'proposed',
  success_signal          text NOT NULL DEFAULT '',
  origin_meeting_id       uuid REFERENCES team_meeting_instances(id) ON DELETE SET NULL,
  approved_in_meeting_id  uuid REFERENCES team_meeting_instances(id) ON DELETE SET NULL,
  last_touched_meeting_id uuid REFERENCES team_meeting_instances(id) ON DELETE SET NULL,
  clickup_url             text,
  founder_note            text,
  check_note              text,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_commitments_severity_check CHECK (
    severity IN ('911', 'below')
  ),
  CONSTRAINT meeting_commitments_constraint_type_check CHECK (
    constraint_type IN ('system', 'quality', 'data')
  ),
  CONSTRAINT meeting_commitments_owner_role_check CHECK (
    owner_role IN ('client_success', 'media_buyer', 'ccm', 'ops', 'founder')
  ),
  CONSTRAINT meeting_commitments_status_check CHECK (
    status IN (
      'proposed',
      'approved',
      'rejected',
      'needs_clarification',
      'in_progress',
      'landed',
      'blocked',
      'missed',
      'cancelled'
    )
  )
);

CREATE INDEX IF NOT EXISTS meeting_commitments_status_needs_founder_idx
  ON meeting_commitments (status, needs_founder);

CREATE INDEX IF NOT EXISTS meeting_commitments_client_created_idx
  ON meeting_commitments (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_commitments_origin_meeting_idx
  ON meeting_commitments (origin_meeting_id);

CREATE INDEX IF NOT EXISTS meeting_commitments_due_date_idx
  ON meeting_commitments (due_date);

CREATE INDEX IF NOT EXISTS meeting_commitments_approved_meeting_idx
  ON meeting_commitments (approved_in_meeting_id);

CREATE INDEX IF NOT EXISTS meeting_commitments_last_touched_meeting_idx
  ON meeting_commitments (last_touched_meeting_id);
