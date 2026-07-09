-- Link team roster (agents) to dashboard logins; expand positions for salaried roles.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS agents_user_id_key
  ON agents (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_pay_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_pay_type_check CHECK (
  pay_type IN ('call_rep', 'b2b_setter', 'admin', 'media_buyer', 'operations', 'other')
);
