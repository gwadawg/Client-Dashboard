-- Split shared trigger function — NEW.converted_client_id is invalid on acquisition_closes.

CREATE OR REPLACE FUNCTION sync_acquisition_calls_client_id_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.converted_client_id IS NOT NULL THEN
    UPDATE acquisition_calls
    SET client_id = NEW.converted_client_id, updated_at = now()
    WHERE lead_id = NEW.id AND client_id IS DISTINCT FROM NEW.converted_client_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_acquisition_calls_client_id_from_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.lead_id IS NOT NULL THEN
    UPDATE acquisition_calls
    SET client_id = NEW.client_id, updated_at = now()
    WHERE lead_id = NEW.lead_id AND client_id IS DISTINCT FROM NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acquisition_leads_sync_calls_client ON acquisition_leads;
CREATE TRIGGER acquisition_leads_sync_calls_client
  AFTER UPDATE OF converted_client_id ON acquisition_leads
  FOR EACH ROW
  WHEN (NEW.converted_client_id IS NOT NULL)
  EXECUTE FUNCTION sync_acquisition_calls_client_id_from_lead();

DROP TRIGGER IF EXISTS acquisition_closes_sync_calls_client ON acquisition_closes;
CREATE TRIGGER acquisition_closes_sync_calls_client
  AFTER INSERT OR UPDATE OF client_id, lead_id ON acquisition_closes
  FOR EACH ROW
  WHEN (NEW.client_id IS NOT NULL AND NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION sync_acquisition_calls_client_id_from_close();

DROP FUNCTION IF EXISTS sync_acquisition_calls_client_id();
