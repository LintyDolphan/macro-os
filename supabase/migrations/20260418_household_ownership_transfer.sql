create or replace function public.reassign_household_owner(target_household_id uuid, departing_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  next_owner_id uuid;
begin
  select hm.user_id
    into next_owner_id
  from public.household_members hm
  where hm.household_id = target_household_id
    and hm.user_id <> departing_user_id
  order by
    case when hm.role = 'owner' then 0 else 1 end,
    hm.created_at asc
  limit 1;

  if next_owner_id is null then
    delete from public.households
    where id = target_household_id;

    return null;
  end if;

  update public.households
  set owner_user_id = next_owner_id,
      updated_at = now()
  where id = target_household_id;

  update public.household_members
  set role = case when user_id = next_owner_id then 'owner' else 'member' end
  where household_id = target_household_id;

  return next_owner_id;
end;
$$;

create or replace function public.leave_current_user_household()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_membership record;
  next_owner_id uuid;
begin
  if current_user_id is null then
    raise exception 'User not signed in';
  end if;

  select hm.id, hm.household_id, hm.role
    into current_membership
  from public.household_members hm
  where hm.user_id = current_user_id
  order by hm.created_at asc
  limit 1;

  if current_membership is null then
    raise exception 'User is not in a household';
  end if;

  if current_membership.role = 'owner' then
    next_owner_id := public.reassign_household_owner(
      current_membership.household_id,
      current_user_id
    );
  end if;

  delete from public.household_members
  where id = current_membership.id
    and user_id = current_user_id;

  return jsonb_build_object(
    'success', true,
    'household_id', current_membership.household_id,
    'transferred_to_user_id', next_owner_id,
    'household_deleted', next_owner_id is null and current_membership.role = 'owner'
  );
end;
$$;

create or replace function public.handle_household_owner_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owned_household record;
begin
  for owned_household in
    select h.id
    from public.households h
    where h.owner_user_id = old.id
  loop
    perform public.reassign_household_owner(owned_household.id, old.id);
  end loop;

  return old;
end;
$$;

drop trigger if exists before_auth_user_delete_reassign_households on auth.users;
create trigger before_auth_user_delete_reassign_households
before delete on auth.users
for each row
execute function public.handle_household_owner_user_delete();

grant execute on function public.leave_current_user_household() to authenticated;
