ALTER TABLE clients ADD COLUMN IF NOT EXISTS ghl_location_id text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_ghl_location_id_key ON clients (ghl_location_id) WHERE ghl_location_id IS NOT NULL;
