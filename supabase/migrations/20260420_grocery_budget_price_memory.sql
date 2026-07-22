create table if not exists public.grocery_price_memories (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid null references auth.users (id) on delete cascade,
  household_id uuid null references public.households (id) on delete cascade,
  item_name text not null,
  normalized_name text not null,
  category text null,
  store_name text null,
  store_location text null,
  currency text not null default 'USD',
  price numeric(10, 2) not null,
  quantity_text text null,
  source_type text not null default 'manual',
  source_label text null,
  observed_at date not null default current_date,
  confidence numeric(4, 3) null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint grocery_price_memories_pkey primary key (id),
  constraint grocery_price_memories_owner_check check (
    (user_id is not null and household_id is null)
    or (user_id is null and household_id is not null)
  ),
  constraint grocery_price_memories_item_name_check check (char_length(trim(item_name)) > 0),
  constraint grocery_price_memories_normalized_name_check check (char_length(trim(normalized_name)) > 0),
  constraint grocery_price_memories_price_check check (price >= 0),
  constraint grocery_price_memories_currency_check check (char_length(trim(currency)) = 3),
  constraint grocery_price_memories_source_type_check check (
    source_type in ('manual', 'receipt_scan', 'api', 'import')
  ),
  constraint grocery_price_memories_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
);

create index if not exists grocery_price_memories_user_name_idx
  on public.grocery_price_memories using btree (user_id, normalized_name, observed_at desc, created_at desc)
  where user_id is not null;

create index if not exists grocery_price_memories_household_name_idx
  on public.grocery_price_memories using btree (household_id, normalized_name, observed_at desc, created_at desc)
  where household_id is not null;

drop trigger if exists grocery_price_memories_set_updated_at on public.grocery_price_memories;
create trigger grocery_price_memories_set_updated_at
before update on public.grocery_price_memories
for each row
execute function public.set_updated_at();

alter table public.grocery_price_memories enable row level security;

drop policy if exists grocery_price_memories_select_visible on public.grocery_price_memories;
create policy grocery_price_memories_select_visible
on public.grocery_price_memories
for select
to authenticated
using (
  user_id = auth.uid()
  or (household_id is not null and public.is_household_member(household_id))
);

drop policy if exists grocery_price_memories_insert_own on public.grocery_price_memories;
create policy grocery_price_memories_insert_own
on public.grocery_price_memories
for insert
to authenticated
with check (
  user_id = auth.uid()
  or (household_id is not null and public.is_household_member(household_id))
);

drop policy if exists grocery_price_memories_update_visible on public.grocery_price_memories;
create policy grocery_price_memories_update_visible
on public.grocery_price_memories
for update
to authenticated
using (
  user_id = auth.uid()
  or (household_id is not null and public.is_household_member(household_id))
)
with check (
  user_id = auth.uid()
  or (household_id is not null and public.is_household_member(household_id))
);

drop policy if exists grocery_price_memories_delete_visible on public.grocery_price_memories;
create policy grocery_price_memories_delete_visible
on public.grocery_price_memories
for delete
to authenticated
using (
  user_id = auth.uid()
  or (household_id is not null and public.is_household_member(household_id))
);
