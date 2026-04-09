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

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

create table if not exists public.inventory_items (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid null references public.households (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  linked_ingredient_id uuid null references public.ingredients (id) on delete set null,
  location text not null default 'pantry',
  quantity numeric(10, 2) not null default 0,
  unit text not null default 'count',
  min_quantity numeric(10, 2) null,
  expiration_date date null,
  notes text null,
  is_low_stock boolean not null default false,
  is_archived boolean not null default false,
  last_suggested_at timestamp with time zone null,
  constraint inventory_items_pkey primary key (id),
  constraint inventory_items_location_check check (
    location in ('fridge', 'freezer', 'pantry', 'snacks', 'supplements', 'other')
  ),
  constraint inventory_items_quantity_check check (quantity >= 0),
  constraint inventory_items_min_quantity_check check (
    min_quantity is null or min_quantity >= 0
  ),
  constraint inventory_items_name_check check (char_length(trim(name)) > 0),
  constraint inventory_items_normalized_name_check check (char_length(trim(normalized_name)) > 0)
);

create table if not exists public.inventory_events (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  source_type text not null,
  event_type text not null,
  quantity_delta numeric(10, 2) not null,
  quantity_after numeric(10, 2) null,
  unit text not null default 'count',
  source_id uuid null,
  source_label text null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint inventory_events_pkey primary key (id),
  constraint inventory_events_source_type_check check (
    source_type in (
      'manual_add',
      'manual_adjust',
      'receipt_scan',
      'barcode_scan',
      'meal_log',
      'snack_log',
      'recipe_log',
      'expiration',
      'system'
    )
  ),
  constraint inventory_events_event_type_check check (
    event_type in ('add', 'consume', 'adjust', 'move', 'expire', 'archive', 'restore')
  ),
  constraint inventory_events_unit_check check (char_length(trim(unit)) > 0)
);

create table if not exists public.inventory_suggestions (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid null references public.households (id) on delete cascade,
  inventory_item_id uuid null references public.inventory_items (id) on delete set null,
  linked_ingredient_id uuid null references public.ingredients (id) on delete set null,
  source_type text not null,
  status text not null default 'pending',
  action_type text not null,
  proposed_name text not null,
  normalized_name text not null,
  proposed_location text not null default 'pantry',
  quantity_delta numeric(10, 2) not null,
  unit text not null default 'count',
  confidence numeric(4, 3) null,
  source_id uuid null,
  source_label text null,
  reason text null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamp with time zone null,
  constraint inventory_suggestions_pkey primary key (id),
  constraint inventory_suggestions_source_type_check check (
    source_type in ('receipt_scan', 'barcode_scan', 'meal_log', 'snack_log', 'recipe_log', 'manual')
  ),
  constraint inventory_suggestions_status_check check (
    status in ('pending', 'approved', 'rejected', 'edited', 'applied')
  ),
  constraint inventory_suggestions_action_type_check check (
    action_type in ('add', 'consume', 'adjust', 'create_item')
  ),
  constraint inventory_suggestions_location_check check (
    proposed_location in ('fridge', 'freezer', 'pantry', 'snacks', 'supplements', 'other')
  ),
  constraint inventory_suggestions_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  constraint inventory_suggestions_name_check check (char_length(trim(proposed_name)) > 0),
  constraint inventory_suggestions_normalized_name_check check (
    char_length(trim(normalized_name)) > 0
  ),
  constraint inventory_suggestions_unit_check check (char_length(trim(unit)) > 0)
);

create index if not exists inventory_items_user_id_idx
  on public.inventory_items using btree (user_id);

create index if not exists inventory_items_user_location_idx
  on public.inventory_items using btree (user_id, location, is_archived);

create index if not exists inventory_items_user_name_idx
  on public.inventory_items using btree (user_id, normalized_name);

create index if not exists inventory_items_expiration_idx
  on public.inventory_items using btree (user_id, expiration_date)
  where expiration_date is not null and is_archived = false;

create index if not exists inventory_items_low_stock_idx
  on public.inventory_items using btree (user_id, is_low_stock)
  where is_archived = false;

create index if not exists inventory_events_item_created_idx
  on public.inventory_events using btree (inventory_item_id, created_at desc);

create index if not exists inventory_events_user_created_idx
  on public.inventory_events using btree (user_id, created_at desc);

create index if not exists inventory_suggestions_user_status_idx
  on public.inventory_suggestions using btree (user_id, status, created_at desc);

create index if not exists inventory_suggestions_item_idx
  on public.inventory_suggestions using btree (inventory_item_id, status);

create index if not exists inventory_suggestions_source_idx
  on public.inventory_suggestions using btree (source_type, source_id);

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row
execute function public.set_updated_at();

drop trigger if exists inventory_suggestions_set_updated_at on public.inventory_suggestions;
create trigger inventory_suggestions_set_updated_at
before update on public.inventory_suggestions
for each row
execute function public.set_updated_at();

alter table public.inventory_items enable row level security;
alter table public.inventory_events enable row level security;
alter table public.inventory_suggestions enable row level security;

drop policy if exists "inventory_items_select_own" on public.inventory_items;
create policy "inventory_items_select_own"
on public.inventory_items
for select
to authenticated
using (
  auth.uid() = user_id
  or (household_id is not null and public.is_household_member(household_id))
);

drop policy if exists "inventory_items_insert_own" on public.inventory_items;
create policy "inventory_items_insert_own"
on public.inventory_items
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    household_id is null
    or public.is_household_member(household_id)
  )
);

drop policy if exists "inventory_items_update_own" on public.inventory_items;
create policy "inventory_items_update_own"
on public.inventory_items
for update
to authenticated
using (
  auth.uid() = user_id
  or (household_id is not null and public.is_household_member(household_id))
)
with check (
  auth.uid() = user_id
  and (
    household_id is null
    or public.is_household_member(household_id)
  )
);

drop policy if exists "inventory_items_delete_own" on public.inventory_items;
create policy "inventory_items_delete_own"
on public.inventory_items
for delete
to authenticated
using (
  auth.uid() = user_id
  or (household_id is not null and public.is_household_member(household_id))
);

drop policy if exists "inventory_events_select_own" on public.inventory_events;
create policy "inventory_events_select_own"
on public.inventory_events
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.inventory_items ii
    where ii.id = inventory_item_id
      and ii.household_id is not null
      and public.is_household_member(ii.household_id)
  )
);

drop policy if exists "inventory_events_insert_own" on public.inventory_events;
create policy "inventory_events_insert_own"
on public.inventory_events
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.inventory_items ii
    where ii.id = inventory_item_id
      and (
        ii.user_id = auth.uid()
        or (ii.household_id is not null and public.is_household_member(ii.household_id))
      )
  )
);

drop policy if exists "inventory_events_update_own" on public.inventory_events;
create policy "inventory_events_update_own"
on public.inventory_events
for update
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.inventory_items ii
    where ii.id = inventory_item_id
      and ii.household_id is not null
      and public.is_household_member(ii.household_id)
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.inventory_items ii
    where ii.id = inventory_item_id
      and (
        ii.user_id = auth.uid()
        or (ii.household_id is not null and public.is_household_member(ii.household_id))
      )
  )
);

drop policy if exists "inventory_events_delete_own" on public.inventory_events;
create policy "inventory_events_delete_own"
on public.inventory_events
for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.inventory_items ii
    where ii.id = inventory_item_id
      and ii.household_id is not null
      and public.is_household_member(ii.household_id)
  )
);

drop policy if exists "inventory_suggestions_select_own" on public.inventory_suggestions;
create policy "inventory_suggestions_select_own"
on public.inventory_suggestions
for select
to authenticated
using (
  auth.uid() = user_id
  or (household_id is not null and public.is_household_member(household_id))
);

drop policy if exists "inventory_suggestions_insert_own" on public.inventory_suggestions;
create policy "inventory_suggestions_insert_own"
on public.inventory_suggestions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    household_id is null
    or public.is_household_member(household_id)
  )
);

drop policy if exists "inventory_suggestions_update_own" on public.inventory_suggestions;
create policy "inventory_suggestions_update_own"
on public.inventory_suggestions
for update
to authenticated
using (
  auth.uid() = user_id
  or (household_id is not null and public.is_household_member(household_id))
)
with check (
  auth.uid() = user_id
  and (
    household_id is null
    or public.is_household_member(household_id)
  )
);

drop policy if exists "inventory_suggestions_delete_own" on public.inventory_suggestions;
create policy "inventory_suggestions_delete_own"
on public.inventory_suggestions
for delete
to authenticated
using (
  auth.uid() = user_id
  or (household_id is not null and public.is_household_member(household_id))
);
