-- Allow explicit churned_at on lifecycle → churned (offboarding / roster backfill).
-- When churned_at is already set on the row, keep it instead of overwriting with now().

create or replace function public.log_client_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.lifecycle_status is distinct from old.lifecycle_status then
    insert into public.client_status_history
      (client_id, previous_status, new_status, mrr_at_change, source)
    values
      (new.id, old.lifecycle_status, new.lifecycle_status, new.mrr, 'trigger');

    new.last_status_changed_at := now();

    if new.lifecycle_status = 'churned' then
      if new.churned_at is null then
        new.churned_at := now();
      end if;
    elsif new.lifecycle_status not in ('churned', 'off_boarding') then
      new.churned_at := null;
    end if;
  end if;
  return new;
end;
$$;
