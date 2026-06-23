-- Add 'scheduled' status to client_billings so upcoming billing cycles can be
-- explicitly committed (with custom amounts / due dates) before payment is
-- collected. This replaces the ephemeral frontend-only "forecast row" concept
-- with a real database record that can be edited, tracked, and audited.
--
-- Also adds a trigger that auto-voids any scheduled (uncommitted) billings when
-- a client is churned, so the queue stays clean without manual cleanup.

-- 1. Drop the existing status check and recreate it with 'scheduled' included.
ALTER TABLE client_billings
  DROP CONSTRAINT IF EXISTS client_billings_status_check;

ALTER TABLE client_billings
  ADD CONSTRAINT client_billings_status_check
  CHECK (status IN (
    'scheduled',
    'pending',
    'partial',
    'paid',
    'overdue',
    'failed',
    'refunded',
    'voided'
  ));

-- 2. Function: when a client is churned, void all of their scheduled billings
--    so they disappear from the active queue automatically.
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
      voided_by = NULL          -- system action, no user actor
    WHERE client_id = NEW.id
      AND status    = 'scheduled';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach the trigger.  Drop first so re-running is idempotent.
DROP TRIGGER IF EXISTS trg_auto_void_scheduled_on_churn ON clients;

CREATE TRIGGER trg_auto_void_scheduled_on_churn
  AFTER UPDATE OF lifecycle_status ON clients
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_void_scheduled_on_churn();
