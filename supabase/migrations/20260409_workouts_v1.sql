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

create table if not exists public.exercises (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  name text not null,
  slug text null,
  category text not null,
  primary_muscle_group text null,
  secondary_muscle_groups text[] not null default '{}',
  equipment text[] not null default '{}',
  movement_pattern text null,
  logging_style text not null,
  instructions text null,
  is_public boolean not null default true,
  created_by_user_id uuid null references auth.users (id) on delete set null,
  constraint exercises_pkey primary key (id),
  constraint exercises_slug_key unique (slug),
  constraint exercises_category_check check (
    category in ('strength', 'cardio', 'mobility', 'core')
  ),
  constraint exercises_logging_style_check check (
    logging_style in ('reps_weight', 'time', 'distance_time', 'reps_only')
  )
);

create table if not exists public.workout_templates (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text null,
  focus_tags text[] not null default '{}',
  estimated_duration_min integer null,
  is_archived boolean not null default false,
  constraint workout_templates_pkey primary key (id),
  constraint workout_templates_estimated_duration_check check (
    estimated_duration_min is null or estimated_duration_min > 0
  )
);

create table if not exists public.workout_template_exercises (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  template_id uuid not null references public.workout_templates (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  sort_order integer not null default 0,
  target_sets integer null,
  target_reps integer null,
  target_reps_min integer null,
  target_reps_max integer null,
  target_weight numeric(10, 2) null,
  target_duration_sec integer null,
  target_distance numeric(10, 2) null,
  target_distance_unit text null,
  target_rest_sec integer null,
  notes text null,
  constraint workout_template_exercises_pkey primary key (id),
  constraint workout_template_exercises_target_sets_check check (
    target_sets is null or target_sets > 0
  ),
  constraint workout_template_exercises_target_reps_check check (
    target_reps is null or target_reps > 0
  ),
  constraint workout_template_exercises_target_reps_min_check check (
    target_reps_min is null or target_reps_min > 0
  ),
  constraint workout_template_exercises_target_reps_max_check check (
    target_reps_max is null or target_reps_max > 0
  ),
  constraint workout_template_exercises_target_weight_check check (
    target_weight is null or target_weight >= 0
  ),
  constraint workout_template_exercises_target_duration_check check (
    target_duration_sec is null or target_duration_sec > 0
  ),
  constraint workout_template_exercises_target_distance_check check (
    target_distance is null or target_distance >= 0
  ),
  constraint workout_template_exercises_target_distance_unit_check check (
    target_distance_unit is null or target_distance_unit in ('km', 'mi', 'm')
  ),
  constraint workout_template_exercises_target_rest_check check (
    target_rest_sec is null or target_rest_sec >= 0
  )
);

create table if not exists public.workout_sessions (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid null references public.workout_templates (id) on delete set null,
  name text not null,
  session_date date not null default current_date,
  started_at timestamp with time zone null,
  completed_at timestamp with time zone null,
  duration_sec integer null,
  status text not null default 'in_progress',
  notes text null,
  constraint workout_sessions_pkey primary key (id),
  constraint workout_sessions_status_check check (
    status in ('in_progress', 'completed', 'cancelled')
  ),
  constraint workout_sessions_duration_check check (
    duration_sec is null or duration_sec >= 0
  )
);

create table if not exists public.workout_session_exercises (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  template_exercise_id uuid null references public.workout_template_exercises (id) on delete set null,
  sort_order integer not null default 0,
  planned_sets integer null,
  planned_reps integer null,
  planned_duration_sec integer null,
  planned_distance numeric(10, 2) null,
  notes text null,
  constraint workout_session_exercises_pkey primary key (id),
  constraint workout_session_exercises_planned_sets_check check (
    planned_sets is null or planned_sets > 0
  ),
  constraint workout_session_exercises_planned_reps_check check (
    planned_reps is null or planned_reps > 0
  ),
  constraint workout_session_exercises_planned_duration_check check (
    planned_duration_sec is null or planned_duration_sec > 0
  ),
  constraint workout_session_exercises_planned_distance_check check (
    planned_distance is null or planned_distance >= 0
  )
);

create table if not exists public.workout_sets (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  session_exercise_id uuid not null references public.workout_session_exercises (id) on delete cascade,
  set_number integer not null,
  reps integer null,
  weight numeric(10, 2) null,
  duration_sec integer null,
  distance numeric(10, 2) null,
  distance_unit text null,
  rir integer null,
  completed boolean not null default false,
  notes text null,
  constraint workout_sets_pkey primary key (id),
  constraint workout_sets_set_number_check check (set_number > 0),
  constraint workout_sets_reps_check check (reps is null or reps >= 0),
  constraint workout_sets_weight_check check (weight is null or weight >= 0),
  constraint workout_sets_duration_check check (duration_sec is null or duration_sec >= 0),
  constraint workout_sets_distance_check check (distance is null or distance >= 0),
  constraint workout_sets_distance_unit_check check (
    distance_unit is null or distance_unit in ('km', 'mi', 'm')
  ),
  constraint workout_sets_rir_check check (rir is null or rir between 0 and 10)
);

create index if not exists exercises_name_idx
  on public.exercises using btree (name);

create index if not exists exercises_category_idx
  on public.exercises using btree (category);

create index if not exists exercises_primary_muscle_idx
  on public.exercises using btree (primary_muscle_group);

create index if not exists exercises_public_name_idx
  on public.exercises using btree (name)
  where is_public = true;

create index if not exists workout_templates_user_id_idx
  on public.workout_templates using btree (user_id);

create index if not exists workout_templates_user_updated_idx
  on public.workout_templates using btree (user_id, updated_at desc);

create index if not exists workout_template_exercises_template_idx
  on public.workout_template_exercises using btree (template_id, sort_order);

create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions using btree (user_id, session_date desc);

create index if not exists workout_sessions_user_status_idx
  on public.workout_sessions using btree (user_id, status);

create index if not exists workout_session_exercises_session_idx
  on public.workout_session_exercises using btree (session_id, sort_order);

create unique index if not exists workout_sets_session_exercise_set_number_idx
  on public.workout_sets using btree (session_exercise_id, set_number);

drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at
before update on public.exercises
for each row
execute function public.set_updated_at();

drop trigger if exists workout_templates_set_updated_at on public.workout_templates;
create trigger workout_templates_set_updated_at
before update on public.workout_templates
for each row
execute function public.set_updated_at();

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row
execute function public.set_updated_at();

alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_sets enable row level security;

drop policy if exists exercises_select_policy on public.exercises;
create policy exercises_select_policy
on public.exercises
for select
to authenticated
using (
  is_public = true or created_by_user_id = auth.uid()
);

drop policy if exists exercises_insert_policy on public.exercises;
create policy exercises_insert_policy
on public.exercises
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
);

drop policy if exists exercises_update_policy on public.exercises;
create policy exercises_update_policy
on public.exercises
for update
to authenticated
using (
  created_by_user_id = auth.uid()
)
with check (
  created_by_user_id = auth.uid()
);

drop policy if exists exercises_delete_policy on public.exercises;
create policy exercises_delete_policy
on public.exercises
for delete
to authenticated
using (
  created_by_user_id = auth.uid()
);

drop policy if exists workout_templates_select_policy on public.workout_templates;
create policy workout_templates_select_policy
on public.workout_templates
for select
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists workout_templates_insert_policy on public.workout_templates;
create policy workout_templates_insert_policy
on public.workout_templates
for insert
to authenticated
with check (
  user_id = auth.uid()
);

drop policy if exists workout_templates_update_policy on public.workout_templates;
create policy workout_templates_update_policy
on public.workout_templates
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

drop policy if exists workout_templates_delete_policy on public.workout_templates;
create policy workout_templates_delete_policy
on public.workout_templates
for delete
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists workout_template_exercises_select_policy on public.workout_template_exercises;
create policy workout_template_exercises_select_policy
on public.workout_template_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = template_id
      and wt.user_id = auth.uid()
  )
);

drop policy if exists workout_template_exercises_insert_policy on public.workout_template_exercises;
create policy workout_template_exercises_insert_policy
on public.workout_template_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = template_id
      and wt.user_id = auth.uid()
  )
);

drop policy if exists workout_template_exercises_update_policy on public.workout_template_exercises;
create policy workout_template_exercises_update_policy
on public.workout_template_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = template_id
      and wt.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = template_id
      and wt.user_id = auth.uid()
  )
);

drop policy if exists workout_template_exercises_delete_policy on public.workout_template_exercises;
create policy workout_template_exercises_delete_policy
on public.workout_template_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_templates wt
    where wt.id = template_id
      and wt.user_id = auth.uid()
  )
);

drop policy if exists workout_sessions_select_policy on public.workout_sessions;
create policy workout_sessions_select_policy
on public.workout_sessions
for select
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists workout_sessions_insert_policy on public.workout_sessions;
create policy workout_sessions_insert_policy
on public.workout_sessions
for insert
to authenticated
with check (
  user_id = auth.uid()
);

drop policy if exists workout_sessions_update_policy on public.workout_sessions;
create policy workout_sessions_update_policy
on public.workout_sessions
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

drop policy if exists workout_sessions_delete_policy on public.workout_sessions;
create policy workout_sessions_delete_policy
on public.workout_sessions
for delete
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists workout_session_exercises_select_policy on public.workout_session_exercises;
create policy workout_session_exercises_select_policy
on public.workout_session_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_session_exercises_insert_policy on public.workout_session_exercises;
create policy workout_session_exercises_insert_policy
on public.workout_session_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_session_exercises_update_policy on public.workout_session_exercises;
create policy workout_session_exercises_update_policy
on public.workout_session_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and ws.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_session_exercises_delete_policy on public.workout_session_exercises;
create policy workout_session_exercises_delete_policy
on public.workout_session_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = session_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_sets_select_policy on public.workout_sets;
create policy workout_sets_select_policy
on public.workout_sets
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_session_exercises wse
    join public.workout_sessions ws on ws.id = wse.session_id
    where wse.id = session_exercise_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_sets_insert_policy on public.workout_sets;
create policy workout_sets_insert_policy
on public.workout_sets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_session_exercises wse
    join public.workout_sessions ws on ws.id = wse.session_id
    where wse.id = session_exercise_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_sets_update_policy on public.workout_sets;
create policy workout_sets_update_policy
on public.workout_sets
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_session_exercises wse
    join public.workout_sessions ws on ws.id = wse.session_id
    where wse.id = session_exercise_id
      and ws.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_session_exercises wse
    join public.workout_sessions ws on ws.id = wse.session_id
    where wse.id = session_exercise_id
      and ws.user_id = auth.uid()
  )
);

drop policy if exists workout_sets_delete_policy on public.workout_sets;
create policy workout_sets_delete_policy
on public.workout_sets
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_session_exercises wse
    join public.workout_sessions ws on ws.id = wse.session_id
    where wse.id = session_exercise_id
      and ws.user_id = auth.uid()
  )
);
