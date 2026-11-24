-- Image metadata table and photo sync (Phase 1c).
-- Run after 20261110213000_practice_image_cards.sql.

create table if not exists public.images (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'drive'
    check (provider in ('drive')),
  remote_id text not null,
  mime text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes bigint not null check (bytes >= 0),
  status text not null default 'uploaded'
    check (status in ('pending','uploading','uploaded','failed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.images enable row level security;

drop policy if exists "Images select own" on public.images;
create policy "Images select own" on public.images
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Images insert own" on public.images;
create policy "Images insert own" on public.images
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Images update own" on public.images;
create policy "Images update own" on public.images
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Images delete own" on public.images;
create policy "Images delete own" on public.images
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.images to authenticated;

create index if not exists images_user_updated_idx
  on public.images (user_id, updated_at desc);

-- Cards reference images by id; enforce the link so a card can never point
-- at an image row that does not exist (or belongs to another user).
alter table public.questions
  drop constraint if exists questions_prompt_image_fk;
alter table public.questions
  add constraint questions_prompt_image_fk
  foreign key (prompt_image_id) references public.images (id)
  on delete set null;

alter table public.fact_cards
  drop constraint if exists fact_cards_prompt_image_fk;
alter table public.fact_cards
  add constraint fact_cards_prompt_image_fk
  foreign key (prompt_image_id) references public.images (id)
  on delete set null;

alter table public.fact_cards
  drop constraint if exists fact_cards_content_image_fk;
alter table public.fact_cards
  add constraint fact_cards_content_image_fk
  foreign key (content_image_id) references public.images (id)
  on delete set null;
