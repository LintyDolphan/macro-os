alter table public.ingredients
  add column if not exists cup_g numeric(10, 2) null,
  add column if not exists tbsp_g numeric(10, 2) null,
  add column if not exists tsp_g numeric(10, 2) null,
  add column if not exists piece_g numeric(10, 2) null,
  add column if not exists piece_label text null;

alter table public.ingredients
  drop constraint if exists ingredients_cup_g_check,
  drop constraint if exists ingredients_tbsp_g_check,
  drop constraint if exists ingredients_tsp_g_check,
  drop constraint if exists ingredients_piece_g_check;

alter table public.ingredients
  add constraint ingredients_cup_g_check check (cup_g is null or cup_g > 0),
  add constraint ingredients_tbsp_g_check check (tbsp_g is null or tbsp_g > 0),
  add constraint ingredients_tsp_g_check check (tsp_g is null or tsp_g > 0),
  add constraint ingredients_piece_g_check check (piece_g is null or piece_g > 0);
