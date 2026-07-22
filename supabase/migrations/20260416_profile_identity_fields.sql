alter table public.user_profiles
  add column if not exists display_name text null,
  add column if not exists username text null,
  add column if not exists avatar_url text null,
  add column if not exists profile_visibility text not null default 'household',
  add column if not exists role_label text not null default 'member',
  add column if not exists bio text null;

alter table public.user_profiles
  drop constraint if exists user_profiles_display_name_check,
  drop constraint if exists user_profiles_username_check,
  drop constraint if exists user_profiles_profile_visibility_check,
  drop constraint if exists user_profiles_role_label_check;

alter table public.user_profiles
  add constraint user_profiles_display_name_check check (
    display_name is null or char_length(trim(display_name)) between 2 and 80
  ),
  add constraint user_profiles_username_check check (
    username is null or username ~ '^[a-zA-Z0-9_]{3,30}$'
  ),
  add constraint user_profiles_profile_visibility_check check (
    profile_visibility in ('private', 'household', 'public')
  ),
  add constraint user_profiles_role_label_check check (
    role_label in ('member', 'coach', 'trainer')
  );

create unique index if not exists user_profiles_username_unique_idx
  on public.user_profiles using btree (lower(username))
  where username is not null;
