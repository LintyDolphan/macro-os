alter table public.macro_log_entries
  add column if not exists planned_meal_id uuid references public.planned_meals(id) on delete set null;

create unique index if not exists macro_log_entries_user_planned_meal_unique
  on public.macro_log_entries (user_id, planned_meal_id)
  where planned_meal_id is not null;
