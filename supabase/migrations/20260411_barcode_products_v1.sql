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

create table if not exists public.barcode_products (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid null references auth.users (id) on delete cascade,
  linked_ingredient_id uuid null references public.ingredients (id) on delete set null,
  barcode text not null,
  normalized_barcode text not null,
  name text not null,
  brand text null,
  serving_amount numeric(10, 2) not null default 1,
  serving_unit text not null default 'serving',
  package_amount numeric(10, 2) null,
  package_unit text null,
  calories numeric(10, 2) not null default 0,
  protein_g numeric(10, 2) not null default 0,
  carbs_g numeric(10, 2) not null default 0,
  fat_g numeric(10, 2) not null default 0,
  source_type text not null default 'manual',
  nutrition_source text null,
  label_image_url text null,
  notes text null,
  visibility text not null default 'private',
  verification_status text not null default 'custom',
  constraint barcode_products_pkey primary key (id),
  constraint barcode_products_barcode_check check (char_length(trim(barcode)) > 0),
  constraint barcode_products_normalized_barcode_check check (
    char_length(trim(normalized_barcode)) > 0
  ),
  constraint barcode_products_name_check check (char_length(trim(name)) > 0),
  constraint barcode_products_serving_amount_check check (serving_amount > 0),
  constraint barcode_products_package_amount_check check (
    package_amount is null or package_amount > 0
  ),
  constraint barcode_products_calories_check check (calories >= 0),
  constraint barcode_products_protein_check check (protein_g >= 0),
  constraint barcode_products_carbs_check check (carbs_g >= 0),
  constraint barcode_products_fat_check check (fat_g >= 0),
  constraint barcode_products_source_type_check check (
    source_type in ('manual', 'barcode_scan', 'label_scan', 'import', 'community')
  ),
  constraint barcode_products_visibility_check check (visibility in ('public', 'private')),
  constraint barcode_products_verification_status_check check (
    verification_status in ('verified', 'custom', 'pending')
  )
);

create unique index if not exists barcode_products_public_barcode_unique_idx
  on public.barcode_products using btree (normalized_barcode)
  where visibility = 'public' and verification_status = 'verified';

create unique index if not exists barcode_products_private_owner_barcode_unique_idx
  on public.barcode_products using btree (user_id, normalized_barcode)
  where visibility = 'private';

create index if not exists barcode_products_user_name_idx
  on public.barcode_products using btree (user_id, name);

create index if not exists barcode_products_barcode_idx
  on public.barcode_products using btree (normalized_barcode);

create index if not exists barcode_products_ingredient_idx
  on public.barcode_products using btree (linked_ingredient_id);

create index if not exists barcode_products_public_verified_name_idx
  on public.barcode_products using btree (name)
  where visibility = 'public' and verification_status = 'verified';

drop trigger if exists barcode_products_set_updated_at on public.barcode_products;
create trigger barcode_products_set_updated_at
before update on public.barcode_products
for each row
execute function public.set_updated_at();

alter table public.barcode_products enable row level security;

drop policy if exists "barcode_products_select_visible" on public.barcode_products;
create policy "barcode_products_select_visible"
on public.barcode_products
for select
to authenticated
using (
  auth.uid() = user_id
  or (
    visibility = 'public'
    and verification_status = 'verified'
  )
);

drop policy if exists "barcode_products_insert_own" on public.barcode_products;
create policy "barcode_products_insert_own"
on public.barcode_products
for insert
to authenticated
with check (
  auth.uid() = user_id
);

drop policy if exists "barcode_products_update_own" on public.barcode_products;
create policy "barcode_products_update_own"
on public.barcode_products
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists "barcode_products_delete_own" on public.barcode_products;
create policy "barcode_products_delete_own"
on public.barcode_products
for delete
to authenticated
using (
  auth.uid() = user_id
);
