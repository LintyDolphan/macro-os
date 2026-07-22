create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.macro_targets (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  calories integer not null,
  protein integer not null,
  carbs integer not null,
  fat integer not null,
  sex text null,
  age integer null,
  activity text null,
  weight_lbs integer null,
  height_in integer null,
  goal text null,
  is_current boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint macro_targets_pkey primary key (id),
  constraint macro_targets_calories_check check (calories >= 0),
  constraint macro_targets_protein_check check (protein >= 0),
  constraint macro_targets_carbs_check check (carbs >= 0),
  constraint macro_targets_fat_check check (fat >= 0),
  constraint macro_targets_sex_check check (sex is null or sex in ('male', 'female')),
  constraint macro_targets_age_check check (age is null or age between 13 and 120),
  constraint macro_targets_activity_check check (
    activity is null or activity in ('sedentary', 'light', 'moderate', 'very', 'athlete')
  ),
  constraint macro_targets_goal_check check (
    goal is null or goal in ('cut', 'maintain', 'bulk')
  )
);

create index if not exists macro_targets_user_updated_idx
  on public.macro_targets using btree (user_id, updated_at desc);

drop trigger if exists macro_targets_set_updated_at on public.macro_targets;
create trigger macro_targets_set_updated_at
before update on public.macro_targets
for each row
execute function public.set_updated_at();

alter table public.macro_targets enable row level security;

drop policy if exists macro_targets_select_own on public.macro_targets;
create policy macro_targets_select_own
on public.macro_targets
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists macro_targets_insert_own on public.macro_targets;
create policy macro_targets_insert_own
on public.macro_targets
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists macro_targets_update_own on public.macro_targets;
create policy macro_targets_update_own
on public.macro_targets
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists macro_targets_delete_own on public.macro_targets;
create policy macro_targets_delete_own
on public.macro_targets
for delete
to authenticated
using (user_id = auth.uid());

create table if not exists public.macro_log_entries (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  name text not null,
  calories integer not null,
  protein integer not null,
  carbs integer not null,
  fat integer not null,
  created_at timestamp with time zone not null default now(),
  constraint macro_log_entries_pkey primary key (id),
  constraint macro_log_entries_date_key_check check (date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint macro_log_entries_name_check check (char_length(trim(name)) between 1 and 160),
  constraint macro_log_entries_calories_check check (calories >= 0),
  constraint macro_log_entries_protein_check check (protein >= 0),
  constraint macro_log_entries_carbs_check check (carbs >= 0),
  constraint macro_log_entries_fat_check check (fat >= 0)
);

create index if not exists macro_log_entries_user_date_idx
  on public.macro_log_entries using btree (user_id, date_key, created_at desc);

alter table public.macro_log_entries enable row level security;

drop policy if exists macro_log_entries_select_own on public.macro_log_entries;
create policy macro_log_entries_select_own
on public.macro_log_entries
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists macro_log_entries_insert_own on public.macro_log_entries;
create policy macro_log_entries_insert_own
on public.macro_log_entries
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists macro_log_entries_update_own on public.macro_log_entries;
create policy macro_log_entries_update_own
on public.macro_log_entries
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists macro_log_entries_delete_own on public.macro_log_entries;
create policy macro_log_entries_delete_own
on public.macro_log_entries
for delete
to authenticated
using (user_id = auth.uid());
