create table if not exists public.questions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text not null,
  chapter_id text not null,
  topic_ids text[] not null default '{}',
  prompt_text text,
  prompt_image_id uuid,
  solution_text text,
  solution_image_id uuid,
  key_insight text,
  times_seen integer not null default 1 check (times_seen > 0),
  last_seen_at timestamptz,
  priority_boost smallint not null default 0
    check (priority_boost between 0 and 3),
  boost_updated_at timestamptz,
  created_from_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint questions_has_prompt check (
    prompt_text is not null or prompt_image_id is not null
  ),
  constraint questions_has_solution check (
    solution_text is not null or key_insight is not null
      or solution_image_id is not null
  )
);

create table if not exists public.fact_cards (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text not null,
  chapter_id text not null,
  topic_ids text[] not null default '{}',
  kind text not null default 'fact'
    check (kind in ('fact', 'formula', 'reaction', 'misconception', 'trap')),
  prompt_text text,
  prompt_image_id uuid,
  content_text text,
  content_image_id uuid,
  wrong_belief text,
  stage smallint not null default 0 check (stage >= 0),
  due_at timestamptz not null default now(),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_reviewed_at timestamptz,
  created_from_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint fact_cards_have_prompt check (
    prompt_text is not null or prompt_image_id is not null
  ),
  constraint fact_cards_have_content check (
    content_text is not null or content_image_id is not null
  )
);

create table if not exists public.question_fact_links (
  question_id uuid not null references public.questions (id) on delete cascade,
  fact_id uuid not null references public.fact_cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (question_id, fact_id)
);

create table if not exists public.fact_reviews (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fact_id uuid not null references public.fact_cards (id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('recalled', 'forgot')),
  stage_before smallint not null check (stage_before >= 0),
  stage_after smallint not null check (stage_after >= 0),
  source text not null check (
    source in ('fact_revision', 'question_revision')
  ),
  attempt_id uuid,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attempts_question_fk'
      and conrelid = 'public.attempts'::regclass
  ) then
    alter table public.attempts
      add constraint attempts_question_fk
      foreign key (question_id) references public.questions (id)
      on delete set null;
  end if;
end;
$$;

create index if not exists questions_user_chapter_idx
  on public.questions (user_id, chapter_id);
create index if not exists questions_user_updated_idx
  on public.questions (user_id, updated_at);
create index if not exists questions_topics_idx
  on public.questions using gin (topic_ids);
create index if not exists fact_cards_user_chapter_idx
  on public.fact_cards (user_id, chapter_id);
create index if not exists fact_cards_user_due_idx
  on public.fact_cards (user_id, due_at);
create index if not exists fact_cards_user_updated_idx
  on public.fact_cards (user_id, updated_at);
create index if not exists fact_cards_topics_idx
  on public.fact_cards using gin (topic_ids);
create index if not exists question_fact_links_user_updated_idx
  on public.question_fact_links (user_id, updated_at);
create index if not exists fact_reviews_user_updated_idx
  on public.fact_reviews (user_id, updated_at);
create index if not exists fact_reviews_fact_reviewed_idx
  on public.fact_reviews (fact_id, reviewed_at desc);

alter table public.questions enable row level security;
alter table public.fact_cards enable row level security;
alter table public.question_fact_links enable row level security;
alter table public.fact_reviews enable row level security;

drop policy if exists "Users can read their own questions" on public.questions;
create policy "Users can read their own questions"
  on public.questions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own questions" on public.questions;
create policy "Users can insert their own questions"
  on public.questions for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own questions" on public.questions;
create policy "Users can update their own questions"
  on public.questions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own questions" on public.questions;
create policy "Users can delete their own questions"
  on public.questions for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own fact cards" on public.fact_cards;
create policy "Users can read their own fact cards"
  on public.fact_cards for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own fact cards" on public.fact_cards;
create policy "Users can insert their own fact cards"
  on public.fact_cards for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own fact cards" on public.fact_cards;
create policy "Users can update their own fact cards"
  on public.fact_cards for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own fact cards" on public.fact_cards;
create policy "Users can delete their own fact cards"
  on public.fact_cards for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own card links"
  on public.question_fact_links;
create policy "Users can read their own card links"
  on public.question_fact_links for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own card links"
  on public.question_fact_links;
create policy "Users can insert their own card links"
  on public.question_fact_links for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.questions
      where questions.id = question_fact_links.question_id
        and questions.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.fact_cards
      where fact_cards.id = question_fact_links.fact_id
        and fact_cards.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can update their own card links"
  on public.question_fact_links;
create policy "Users can update their own card links"
  on public.question_fact_links for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.questions
      where questions.id = question_fact_links.question_id
        and questions.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.fact_cards
      where fact_cards.id = question_fact_links.fact_id
        and fact_cards.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can delete their own card links"
  on public.question_fact_links;
create policy "Users can delete their own card links"
  on public.question_fact_links for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own fact reviews"
  on public.fact_reviews;
create policy "Users can read their own fact reviews"
  on public.fact_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own fact reviews"
  on public.fact_reviews;
create policy "Users can insert their own fact reviews"
  on public.fact_reviews for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.fact_cards
      where fact_cards.id = fact_reviews.fact_id
        and fact_cards.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can update their own fact reviews"
  on public.fact_reviews;
create policy "Users can update their own fact reviews"
  on public.fact_reviews for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.fact_cards
      where fact_cards.id = fact_reviews.fact_id
        and fact_cards.user_id = (select auth.uid())
    )
  );
drop policy if exists "Users can delete their own fact reviews"
  on public.fact_reviews;
create policy "Users can delete their own fact reviews"
  on public.fact_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.fact_cards to authenticated;
grant select, insert, update, delete on public.question_fact_links to authenticated;
grant select, insert, update, delete on public.fact_reviews to authenticated;

create or replace function public.set_card_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_card_updated_at();
drop trigger if exists fact_cards_set_updated_at on public.fact_cards;
create trigger fact_cards_set_updated_at
  before update on public.fact_cards
  for each row execute function public.set_card_updated_at();
drop trigger if exists question_fact_links_set_updated_at
  on public.question_fact_links;
create trigger question_fact_links_set_updated_at
  before update on public.question_fact_links
  for each row execute function public.set_card_updated_at();
drop trigger if exists fact_reviews_set_updated_at on public.fact_reviews;
create trigger fact_reviews_set_updated_at
  before update on public.fact_reviews
  for each row execute function public.set_card_updated_at();
