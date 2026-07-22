create or replace function public.get_household_profile_cards(target_user_ids uuid[])
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  profile_visibility text,
  role_label text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    profiles.user_id,
    profiles.display_name,
    profiles.username,
    profiles.avatar_url,
    profiles.profile_visibility,
    profiles.role_label
  from public.user_profiles profiles
  where profiles.user_id = any(target_user_ids)
    and (
      profiles.user_id = auth.uid()
      or profiles.profile_visibility = 'public'
      or (
        profiles.profile_visibility = 'household'
        and exists (
          select 1
          from public.household_members viewer
          join public.household_members subject
            on subject.household_id = viewer.household_id
          where viewer.user_id = auth.uid()
            and subject.user_id = profiles.user_id
        )
      )
    );
$$;

grant execute on function public.get_household_profile_cards(uuid[]) to authenticated;
