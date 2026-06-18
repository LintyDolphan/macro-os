create extension if not exists pgcrypto;

alter table public.ingredients
  add column if not exists brand_name text null,
  add column if not exists food_category text null,
  add column if not exists serving_size_g numeric(10, 2) null,
  add column if not exists serving_label text null,
  add column if not exists package_size text null,
  add column if not exists data_source text null,
  add column if not exists external_source_id text null,
  add column if not exists source_confidence numeric(4, 3) null,
  add column if not exists dietary_tags text[] not null default '{}',
  add column if not exists allergen_tags text[] not null default '{}',
  add column if not exists ingredient_notes text null;

alter table public.ingredients
  drop constraint if exists ingredients_serving_size_g_check,
  drop constraint if exists ingredients_source_confidence_check;

alter table public.ingredients
  add constraint ingredients_serving_size_g_check check (serving_size_g is null or serving_size_g > 0),
  add constraint ingredients_source_confidence_check check (
    source_confidence is null or source_confidence between 0 and 1
  );

create index if not exists ingredients_data_source_idx
  on public.ingredients using btree (data_source, external_source_id);

create index if not exists ingredients_food_category_idx
  on public.ingredients using btree (food_category);

create table if not exists public.ingredient_external_sources (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  source_name text not null,
  source_id text not null,
  source_url text null,
  payload jsonb null,
  imported_at timestamp with time zone not null default now(),
  confidence numeric(4, 3) null,
  constraint ingredient_external_sources_pkey primary key (id),
  constraint ingredient_external_sources_name_check check (char_length(trim(source_name)) > 0),
  constraint ingredient_external_sources_id_check check (char_length(trim(source_id)) > 0),
  constraint ingredient_external_sources_confidence_check check (
    confidence is null or confidence between 0 and 1
  )
);

create unique index if not exists ingredient_external_sources_unique_idx
  on public.ingredient_external_sources using btree (source_name, source_id);

create index if not exists ingredient_external_sources_ingredient_idx
  on public.ingredient_external_sources using btree (ingredient_id);

drop trigger if exists ingredient_external_sources_set_updated_at on public.ingredient_external_sources;
create trigger ingredient_external_sources_set_updated_at
before update on public.ingredient_external_sources
for each row
execute function public.set_updated_at();

create table if not exists public.ingredient_nutrients (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  nutrient_key text not null,
  nutrient_name text not null,
  amount numeric(12, 4) not null,
  unit text not null,
  basis_amount_g numeric(10, 2) not null default 100,
  source_name text null,
  constraint ingredient_nutrients_pkey primary key (id),
  constraint ingredient_nutrients_key_check check (char_length(trim(nutrient_key)) > 0),
  constraint ingredient_nutrients_name_check check (char_length(trim(nutrient_name)) > 0),
  constraint ingredient_nutrients_amount_check check (amount >= 0),
  constraint ingredient_nutrients_basis_check check (basis_amount_g > 0)
);

create unique index if not exists ingredient_nutrients_unique_idx
  on public.ingredient_nutrients using btree (ingredient_id, nutrient_key, basis_amount_g);

drop trigger if exists ingredient_nutrients_set_updated_at on public.ingredient_nutrients;
create trigger ingredient_nutrients_set_updated_at
before update on public.ingredient_nutrients
for each row
execute function public.set_updated_at();

create table if not exists public.ingredient_prices (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete cascade,
  store_name text null,
  region text null,
  currency text not null default 'USD',
  price numeric(10, 2) not null,
  package_amount numeric(10, 2) null,
  package_unit text null,
  price_per_100g numeric(10, 4) null,
  observed_at date not null default current_date,
  source_name text not null default 'manual',
  source_url text null,
  visibility text not null default 'private',
  constraint ingredient_prices_pkey primary key (id),
  constraint ingredient_prices_price_check check (price >= 0),
  constraint ingredient_prices_package_amount_check check (
    package_amount is null or package_amount > 0
  ),
  constraint ingredient_prices_price_per_100g_check check (
    price_per_100g is null or price_per_100g >= 0
  ),
  constraint ingredient_prices_visibility_check check (visibility in ('public', 'private'))
);

create index if not exists ingredient_prices_ingredient_observed_idx
  on public.ingredient_prices using btree (ingredient_id, observed_at desc);

create index if not exists ingredient_prices_user_idx
  on public.ingredient_prices using btree (user_id, observed_at desc);

drop trigger if exists ingredient_prices_set_updated_at on public.ingredient_prices;
create trigger ingredient_prices_set_updated_at
before update on public.ingredient_prices
for each row
execute function public.set_updated_at();

alter table public.exercises
  add column if not exists aliases text[] not null default '{}',
  add column if not exists description text null,
  add column if not exists difficulty text null,
  add column if not exists exercise_type text null,
  add column if not exists target_muscles text[] not null default '{}',
  add column if not exists safety_cues text[] not null default '{}',
  add column if not exists source_name text null,
  add column if not exists external_source_id text null,
  add column if not exists source_url text null,
  add column if not exists verification_status text not null default 'verified';

alter table public.exercises
  drop constraint if exists exercises_difficulty_check,
  drop constraint if exists exercises_verification_status_check;

alter table public.exercises
  add constraint exercises_difficulty_check check (
    difficulty is null or difficulty in ('beginner', 'intermediate', 'advanced', 'expert')
  ),
  add constraint exercises_verification_status_check check (
    verification_status in ('verified', 'custom', 'pending')
  );

create index if not exists exercises_source_idx
  on public.exercises using btree (source_name, external_source_id);

create index if not exists exercises_aliases_idx
  on public.exercises using gin (aliases);

create index if not exists exercises_target_muscles_idx
  on public.exercises using gin (target_muscles);

create table if not exists public.exercise_media (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  media_type text not null,
  url text not null,
  thumbnail_url text null,
  alt_text text null,
  attribution text null,
  license text null,
  source_name text null,
  source_url text null,
  sort_order integer not null default 0,
  constraint exercise_media_pkey primary key (id),
  constraint exercise_media_type_check check (media_type in ('image', 'video', 'animation')),
  constraint exercise_media_url_check check (char_length(trim(url)) > 0)
);

create index if not exists exercise_media_exercise_idx
  on public.exercise_media using btree (exercise_id, sort_order);

drop trigger if exists exercise_media_set_updated_at on public.exercise_media;
create trigger exercise_media_set_updated_at
before update on public.exercise_media
for each row
execute function public.set_updated_at();

alter table public.ingredient_external_sources enable row level security;
alter table public.ingredient_nutrients enable row level security;
alter table public.ingredient_prices enable row level security;
alter table public.exercise_media enable row level security;

drop policy if exists ingredient_external_sources_select_visible on public.ingredient_external_sources;
create policy ingredient_external_sources_select_visible
on public.ingredient_external_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.ingredients i
    where i.id = ingredient_id
      and (
        i.user_id = auth.uid()
        or (i.visibility = 'public' and i.verification_status = 'verified')
      )
  )
);

drop policy if exists ingredient_nutrients_select_visible on public.ingredient_nutrients;
create policy ingredient_nutrients_select_visible
on public.ingredient_nutrients
for select
to authenticated
using (
  exists (
    select 1
    from public.ingredients i
    where i.id = ingredient_id
      and (
        i.user_id = auth.uid()
        or (i.visibility = 'public' and i.verification_status = 'verified')
      )
  )
);

drop policy if exists ingredient_prices_select_visible on public.ingredient_prices;
create policy ingredient_prices_select_visible
on public.ingredient_prices
for select
to authenticated
using (
  visibility = 'public'
  or user_id = auth.uid()
  or exists (
    select 1
    from public.ingredients i
    where i.id = ingredient_id
      and i.user_id = auth.uid()
  )
);

drop policy if exists ingredient_prices_insert_own on public.ingredient_prices;
create policy ingredient_prices_insert_own
on public.ingredient_prices
for insert
to authenticated
with check (
  user_id = auth.uid()
);

drop policy if exists ingredient_prices_update_own on public.ingredient_prices;
create policy ingredient_prices_update_own
on public.ingredient_prices
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

drop policy if exists ingredient_prices_delete_own on public.ingredient_prices;
create policy ingredient_prices_delete_own
on public.ingredient_prices
for delete
to authenticated
using (
  user_id = auth.uid()
);

drop policy if exists exercise_media_select_visible on public.exercise_media;
create policy exercise_media_select_visible
on public.exercise_media
for select
to authenticated
using (
  exists (
    select 1
    from public.exercises e
    where e.id = exercise_id
      and (e.is_public = true or e.created_by_user_id = auth.uid())
  )
);
