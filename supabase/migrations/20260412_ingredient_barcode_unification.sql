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

alter table public.ingredients
  add column if not exists ingredient_type text not null default 'raw';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredients_ingredient_type_check'
  ) then
    alter table public.ingredients
      add constraint ingredients_ingredient_type_check
      check (ingredient_type in ('raw', 'packaged', 'custom'));
  end if;
end;
$$;

update public.ingredients
set ingredient_type = case
  when visibility = 'private' and verification_status = 'custom' then 'custom'
  else 'raw'
end
where ingredient_type is null
   or ingredient_type not in ('raw', 'packaged', 'custom');

create table if not exists public.ingredient_barcodes (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  barcode text not null,
  normalized_barcode text not null,
  source_type text not null default 'manual',
  notes text null,
  visibility text not null default 'private',
  verification_status text not null default 'custom',
  constraint ingredient_barcodes_pkey primary key (id),
  constraint ingredient_barcodes_barcode_check check (char_length(trim(barcode)) > 0),
  constraint ingredient_barcodes_normalized_barcode_check check (
    char_length(trim(normalized_barcode)) > 0
  ),
  constraint ingredient_barcodes_source_type_check check (
    source_type in ('manual', 'barcode_scan', 'label_scan', 'import', 'community')
  ),
  constraint ingredient_barcodes_visibility_check check (visibility in ('public', 'private')),
  constraint ingredient_barcodes_verification_status_check check (
    verification_status in ('verified', 'custom', 'pending')
  )
);

create unique index if not exists ingredient_barcodes_public_barcode_unique_idx
  on public.ingredient_barcodes using btree (normalized_barcode)
  where visibility = 'public' and verification_status = 'verified';

create unique index if not exists ingredient_barcodes_private_owner_barcode_unique_idx
  on public.ingredient_barcodes using btree (user_id, normalized_barcode)
  where visibility = 'private';

create index if not exists ingredient_barcodes_ingredient_idx
  on public.ingredient_barcodes using btree (ingredient_id);

create index if not exists ingredient_barcodes_barcode_idx
  on public.ingredient_barcodes using btree (normalized_barcode);

drop trigger if exists ingredient_barcodes_set_updated_at on public.ingredient_barcodes;
create trigger ingredient_barcodes_set_updated_at
before update on public.ingredient_barcodes
for each row
execute function public.set_updated_at();

alter table public.ingredient_barcodes enable row level security;

drop policy if exists "ingredient_barcodes_select_visible" on public.ingredient_barcodes;
create policy "ingredient_barcodes_select_visible"
on public.ingredient_barcodes
for select
to authenticated
using (
  auth.uid() = user_id
  or (
    visibility = 'public'
    and verification_status = 'verified'
  )
);

drop policy if exists "ingredient_barcodes_insert_own" on public.ingredient_barcodes;
create policy "ingredient_barcodes_insert_own"
on public.ingredient_barcodes
for insert
to authenticated
with check (
  auth.uid() = user_id
);

drop policy if exists "ingredient_barcodes_update_own" on public.ingredient_barcodes;
create policy "ingredient_barcodes_update_own"
on public.ingredient_barcodes
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists "ingredient_barcodes_delete_own" on public.ingredient_barcodes;
create policy "ingredient_barcodes_delete_own"
on public.ingredient_barcodes
for delete
to authenticated
using (
  auth.uid() = user_id
);

do $$
declare
  product record;
  packaged_ingredient_id uuid;
  weight_based boolean;
begin
  for product in
    select *
    from public.barcode_products
    order by created_at asc
  loop
    packaged_ingredient_id := product.linked_ingredient_id;
    weight_based := lower(coalesce(product.serving_unit, '')) in ('g', 'gram', 'grams');

    if packaged_ingredient_id is null then
      insert into public.ingredients (
        user_id,
        name,
        reference_amount_g,
        reference_calories,
        reference_protein_g,
        reference_carbs_g,
        reference_fat_g,
        visibility,
        verification_status,
        source_note,
        ingredient_type
      )
      values (
        product.user_id,
        product.name,
        case
          when weight_based and coalesce(product.serving_amount, 0) > 0 then product.serving_amount
          else 100
        end,
        case when weight_based then coalesce(product.calories, 0) else 0 end,
        case when weight_based then coalesce(product.protein_g, 0) else 0 end,
        case when weight_based then coalesce(product.carbs_g, 0) else 0 end,
        case when weight_based then coalesce(product.fat_g, 0) else 0 end,
        product.visibility,
        product.verification_status,
        case
          when weight_based then coalesce(product.notes, 'Created from barcode product migration.')
          else trim(
            both ' '
            from concat(
              'Created from barcode product migration. Nutrition remains on barcode_products until packaged-food nutrition is fully unified.',
              case when product.notes is not null and length(trim(product.notes)) > 0 then ' ' || trim(product.notes) else '' end
            )
          )
        end,
        'packaged'
      )
      returning id into packaged_ingredient_id;

      update public.barcode_products
      set linked_ingredient_id = packaged_ingredient_id
      where id = product.id;
    else
      update public.ingredients
      set ingredient_type = 'packaged'
      where id = packaged_ingredient_id
        and ingredient_type <> 'packaged';
    end if;

    insert into public.ingredient_barcodes (
      user_id,
      ingredient_id,
      barcode,
      normalized_barcode,
      source_type,
      notes,
      visibility,
      verification_status
    )
    values (
      product.user_id,
      packaged_ingredient_id,
      product.barcode,
      product.normalized_barcode,
      product.source_type,
      product.notes,
      product.visibility,
      product.verification_status
    )
    on conflict do nothing;
  end loop;
end;
$$;
