create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamp with time zone null,
  age integer null,
  gender text null,
  height_cm numeric(6, 2) null,
  weight_kg numeric(6, 2) null,
  target_weight_kg numeric(6, 2) null,
  goal_type text null,
  activity_level text null,
  dietary_restrictions text[] not null default '{}',
  food_preferences text[] not null default '{}',
  budget_priority text null,
  training_goal text null,
  training_days_per_week integer null,
  equipment_access text[] not null default '{}',
  health_limitations text null,
  workout_preferences text[] not null default '{}',
  intelligence_notes jsonb not null default '{}'::jsonb,
  constraint user_profiles_pkey primary key (id),
  constraint user_profiles_user_unique unique (user_id),
  constraint user_profiles_age_check check (age is null or age between 13 and 120),
  constraint user_profiles_height_check check (height_cm is null or height_cm > 0),
  constraint user_profiles_weight_check check (weight_kg is null or weight_kg > 0),
  constraint user_profiles_target_weight_check check (target_weight_kg is null or target_weight_kg > 0),
  constraint user_profiles_training_days_check check (
    training_days_per_week is null or training_days_per_week between 0 and 7
  ),
  constraint user_profiles_gender_check check (
    gender is null or gender in ('male', 'female', 'other', 'prefer_not_to_say')
  ),
  constraint user_profiles_goal_check check (
    goal_type is null or goal_type in ('cut', 'maintain', 'bulk', 'recomp')
  ),
  constraint user_profiles_activity_check check (
    activity_level is null or activity_level in ('sedentary', 'light', 'moderate', 'very', 'athlete')
  ),
  constraint user_profiles_budget_check check (
    budget_priority is null or budget_priority in ('low', 'balanced', 'flexible')
  ),
  constraint user_profiles_training_goal_check check (
    training_goal is null or training_goal in ('strength', 'muscle', 'fat_loss', 'endurance', 'general')
  )
);

create index if not exists user_profiles_user_idx
  on public.user_profiles using btree (user_id);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own
on public.user_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_profiles_delete_own on public.user_profiles;
create policy user_profiles_delete_own
on public.user_profiles
for delete
to authenticated
using (user_id = auth.uid());
