-- Dialing software/source for call analytics (e.g. GHL, HP).
alter table public.events add column if not exists dial_source text;
create index if not exists events_dial_source_idx
  on public.events (dial_source) where dial_source is not null;
