create extension if not exists pgcrypto;

create table if not exists public.ingredients (
  id uuid not null default gen_random_uuid (),
  user_id uuid null references auth.users (id) on delete cascade,
  name text not null,
  reference_amount_g numeric(10, 2) not null,
  reference_calories numeric(10, 2) not null default 0,
  reference_protein_g numeric(10, 2) not null default 0,
  reference_carbs_g numeric(10, 2) not null default 0,
  reference_fat_g numeric(10, 2) not null default 0,
  calories_per_100g numeric(10, 2) generated always as (
    case
      when reference_amount_g > 0 then (reference_calories * 100) / reference_amount_g
      else 0
    end
  ) stored,
  protein_per_100g numeric(10, 2) generated always as (
    case
      when reference_amount_g > 0 then (reference_protein_g * 100) / reference_amount_g
      else 0
    end
  ) stored,
  carbs_per_100g numeric(10, 2) generated always as (
    case
      when reference_amount_g > 0 then (reference_carbs_g * 100) / reference_amount_g
      else 0
    end
  ) stored,
  fat_per_100g numeric(10, 2) generated always as (
    case
      when reference_amount_g > 0 then (reference_fat_g * 100) / reference_amount_g
      else 0
    end
  ) stored,
  visibility text not null default 'private',
  verification_status text not null default 'custom',
  source_note text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ingredients_pkey primary key (id),
  constraint ingredients_reference_amount_check check (reference_amount_g > 0),
  constraint ingredients_reference_calories_check check (reference_calories >= 0),
  constraint ingredients_reference_protein_check check (reference_protein_g >= 0),
  constraint ingredients_reference_carbs_check check (reference_carbs_g >= 0),
  constraint ingredients_reference_fat_check check (reference_fat_g >= 0),
  constraint ingredients_visibility_check check (visibility in ('public', 'private')),
  constraint ingredients_verification_status_check check (
    verification_status in ('verified', 'custom', 'pending')
  )
);

alter table public.ingredients
  add column if not exists user_id uuid null references auth.users (id) on delete cascade,
  add column if not exists visibility text not null default 'private',
  add column if not exists verification_status text not null default 'custom',
  add column if not exists source_note text null,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now();

create index if not exists ingredients_public_verified_name_idx
  on public.ingredients using btree (name)
  where visibility = 'public' and verification_status = 'verified' and user_id is null;

create index if not exists ingredients_user_name_idx
  on public.ingredients using btree (user_id, name);

create unique index if not exists ingredients_public_name_unique_idx
  on public.ingredients using btree (lower(name))
  where visibility = 'public' and verification_status = 'verified' and user_id is null;

create unique index if not exists ingredients_private_owner_name_unique_idx
  on public.ingredients using btree (user_id, lower(name))
  where visibility = 'private';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ingredients_set_updated_at on public.ingredients;

create trigger ingredients_set_updated_at
before update on public.ingredients
for each row
execute function public.set_updated_at();
