-- HE / dial-only leads: where the contact came from (list name, partner, campaign, etc.)
ALTER TABLE events ADD COLUMN IF NOT EXISTS lead_source text;

CREATE INDEX IF NOT EXISTS events_lead_source_idx
  ON events (lead_source)
  WHERE lead_source IS NOT NULL AND event_type = 'lead';
