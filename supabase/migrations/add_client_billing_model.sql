-- Billing model split: fixed retainer vs performance (report → objection → bill).
-- Distinct from reporting_type / offer so future performance offers don't require
-- new vertical columns.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'fixed';

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pay_per_show numeric;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pay_per_bailed numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_billing_model_check'
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT clients_billing_model_check
      CHECK (billing_model IN ('fixed', 'performance'));
  END IF;
END $$;

-- Backfill: call center clients use performance billing by default.
UPDATE clients
SET billing_model = 'performance'
WHERE reporting_type IN ('CALL_CENTER', 'HE')
  AND billing_model = 'fixed';

-- Performance billing cycles (state before a ledger row exists).
CREATE TABLE IF NOT EXISTS client_billing_cycles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_start          date        NOT NULL,
  period_end            date        NOT NULL,
  base_amount           numeric     NOT NULL DEFAULT 0,
  show_count            int         NOT NULL DEFAULT 0,
  bailed_count          int         NOT NULL DEFAULT 0,
  pay_per_show          numeric     NOT NULL DEFAULT 0,
  pay_per_bailed        numeric     NOT NULL DEFAULT 0,
  performance_amount    numeric     NOT NULL DEFAULT 0,
  discount              numeric     NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'draft',
  report_sent_at        timestamptz,
  objection_deadline_at timestamptz,
  dispute_note          text,
  billing_id            uuid        REFERENCES client_billings(id) ON DELETE SET NULL,
  note                  text,
  created_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT client_billing_cycles_status_check CHECK (
    status IN ('draft', 'report_sent', 'ready_to_bill', 'disputed', 'billed', 'voided')
  )
);

CREATE INDEX IF NOT EXISTS client_billing_cycles_client_idx
  ON client_billing_cycles (client_id, period_end DESC);

CREATE INDEX IF NOT EXISTS client_billing_cycles_status_idx
  ON client_billing_cycles (status)
  WHERE status NOT IN ('billed', 'voided');

-- Extend churn trigger: void open performance cycles alongside scheduled billings.
CREATE OR REPLACE FUNCTION fn_auto_void_scheduled_on_churn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.lifecycle_status = 'churned'
     AND (OLD.lifecycle_status IS DISTINCT FROM 'churned')
  THEN
    UPDATE client_billings
    SET
      status    = 'voided',
      voided_at = NOW(),
      voided_by = NULL
    WHERE client_id = NEW.id
      AND status    = 'scheduled';

    UPDATE client_billing_cycles
    SET
      status     = 'voided',
      updated_at = NOW()
    WHERE client_id = NEW.id
      AND status IN ('draft', 'report_sent', 'ready_to_bill', 'disputed');
  END IF;
  RETURN NEW;
END;
$$;
