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

create table if not exists public.beta_feedback (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  category text not null default 'general',
  sentiment text not null default 'idea',
  rating integer null,
  page_path text null,
  message text not null,
  status text not null default 'new',
  admin_notes text null,
  constraint beta_feedback_pkey primary key (id),
  constraint beta_feedback_category_check check (
    category in ('general', 'bug', 'idea', 'flow', 'visual', 'nutrition', 'workout', 'grocery', 'account')
  ),
  constraint beta_feedback_sentiment_check check (
    sentiment in ('issue', 'idea', 'praise', 'question')
  ),
  constraint beta_feedback_rating_check check (rating is null or rating between 1 and 5),
  constraint beta_feedback_status_check check (
    status in ('new', 'reviewing', 'planned', 'resolved', 'closed')
  ),
  constraint beta_feedback_message_check check (char_length(trim(message)) between 3 and 2000)
);

create index if not exists beta_feedback_user_created_idx
  on public.beta_feedback using btree (user_id, created_at desc);

create index if not exists beta_feedback_status_created_idx
  on public.beta_feedback using btree (status, created_at desc);

drop trigger if exists beta_feedback_set_updated_at on public.beta_feedback;
create trigger beta_feedback_set_updated_at
before update on public.beta_feedback
for each row
execute function public.set_updated_at();

alter table public.beta_feedback enable row level security;

drop policy if exists beta_feedback_select_own on public.beta_feedback;
create policy beta_feedback_select_own
on public.beta_feedback
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists beta_feedback_insert_own on public.beta_feedback;
create policy beta_feedback_insert_own
on public.beta_feedback
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists beta_feedback_update_own on public.beta_feedback;
create policy beta_feedback_update_own
on public.beta_feedback
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and status = 'new'
);

drop policy if exists beta_feedback_delete_own on public.beta_feedback;
create policy beta_feedback_delete_own
on public.beta_feedback
for delete
to authenticated
using (user_id = auth.uid() and status = 'new');
