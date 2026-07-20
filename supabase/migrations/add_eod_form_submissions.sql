-- End-of-day forms for Media Buyer, Client Success, and CCM.
-- One submission per agent + department + work_date (upsert on resubmit).

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_pay_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_pay_type_check CHECK (
  pay_type IN (
    'call_rep',
    'b2b_setter',
    'admin',
    'media_buyer',
    'operations',
    'client_success',
    'ccm',
    'other'
  )
);

CREATE TABLE IF NOT EXISTS eod_form_submissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id               uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  department             text NOT NULL,
  work_date              date NOT NULL,
  status                 text NOT NULL DEFAULT 'submitted',
  submitted_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_label     text,
  responses              jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eod_form_submissions_department_check CHECK (
    department IN ('media_buyer', 'client_success', 'ccm')
  ),
  CONSTRAINT eod_form_submissions_status_check CHECK (
    status IN ('draft', 'submitted')
  ),
  CONSTRAINT eod_form_submissions_unique_day UNIQUE (agent_id, department, work_date)
);

CREATE INDEX IF NOT EXISTS eod_form_submissions_agent_id_idx
  ON eod_form_submissions (agent_id);

CREATE INDEX IF NOT EXISTS eod_form_submissions_department_idx
  ON eod_form_submissions (department);

CREATE INDEX IF NOT EXISTS eod_form_submissions_work_date_idx
  ON eod_form_submissions (work_date DESC);

COMMENT ON TABLE eod_form_submissions IS
  'Daily EOD check-ins for lead seats (media buyer, CS, CCM). responses JSONB holds shared + department fields.';
