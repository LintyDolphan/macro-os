alter table public.grocery_price_memories
  add column if not exists price_unit text not null default 'each';

alter table public.grocery_price_memories
  drop constraint if exists grocery_price_memories_price_unit_check;

alter table public.grocery_price_memories
  add constraint grocery_price_memories_price_unit_check check (
    price_unit in ('each', 'lb', 'kg')
  );
