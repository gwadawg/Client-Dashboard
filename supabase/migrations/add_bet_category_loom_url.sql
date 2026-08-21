-- Bet action category + Loom evidence URL on client work log.
alter table client_action_logs
  add column if not exists bet_category text;

alter table client_action_logs
  add column if not exists loom_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_action_logs_bet_category_check'
  ) then
    alter table client_action_logs
      add constraint client_action_logs_bet_category_check
      check (
        bet_category is null
        or bet_category in (
          'new_creatives',
          'new_angle_offer',
          'audience_targeting',
          'landing_optin',
          'budget_allocation',
          'campaign_structure',
          'reactivate_leads',
          'confirmation_rebook',
          'dial_coverage',
          'script_booking',
          'live_transfer',
          'lo_show_process',
          'other'
        )
      );
  end if;
end $$;

create index if not exists client_action_logs_client_bet_category_idx
  on client_action_logs (client_id, bet_category)
  where bet_category is not null;
