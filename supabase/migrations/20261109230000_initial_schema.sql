create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id text,
  subject_name text not null,
  chapter_id text,
  chapter_name text not null,
  syllabus_exam text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  planned_duration_minutes integer not null check (planned_duration_minutes > 0),
  status text not null check (status in ('completed', 'ended_early')),
  right_count integer not null default 0 check (right_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  couldnt_solve_count integer not null default 0 check (couldnt_solve_count >= 0),
  timed_question_count integer not null default 0 check (timed_question_count >= 0),
  active_time_ms bigint not null default 0 check (active_time_ms >= 0),
  avg_time_per_question_ms bigint,
  created_at timestamptz not null default now(),
  constraint sessions_valid_period check (ended_at >= started_at),
  constraint sessions_valid_timed_count check (
    timed_question_count = right_count + wrong_count + couldnt_solve_count
  ),
  constraint sessions_valid_average check (
    (timed_question_count = 0 and avg_time_per_question_ms is null)
    or (
      timed_question_count > 0
      and avg_time_per_question_ms is not null
      and avg_time_per_question_ms =
        round(active_time_ms::numeric / timed_question_count)::bigint
    )
  )
);

create index sessions_user_started_idx
  on public.sessions (user_id, started_at desc);
create index sessions_user_subject_started_idx
  on public.sessions (user_id, subject_id, started_at desc);

create table public.session_weak_topics (
  session_id uuid not null references public.sessions (id) on delete cascade,
  topic_id text not null,
  topic_name text not null,
  question_count integer not null check (question_count > 0),
  primary key (session_id, topic_id)
);

create index session_weak_topics_topic_idx
  on public.session_weak_topics (topic_id);

alter table public.sessions enable row level security;
alter table public.session_weak_topics enable row level security;

create policy "Users can read their own sessions"
  on public.sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own sessions"
  on public.sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own sessions"
  on public.sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read weak topics for their sessions"
  on public.session_weak_topics for select to authenticated
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_weak_topics.session_id
        and sessions.user_id = (select auth.uid())
    )
  );
create policy "Users can add weak topics to their sessions"
  on public.session_weak_topics for insert to authenticated
  with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_weak_topics.session_id
        and sessions.user_id = (select auth.uid())
    )
  );
create policy "Users can update weak topics for their sessions"
  on public.session_weak_topics for update to authenticated
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_weak_topics.session_id
        and sessions.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_weak_topics.session_id
        and sessions.user_id = (select auth.uid())
    )
  );
create policy "Users can delete weak topics for their sessions"
  on public.session_weak_topics for delete to authenticated
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_weak_topics.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

create or replace function public.upsert_session_with_topics(
  p_session jsonb,
  p_weak_topics jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid := (p_session ->> 'id')::uuid;
  affected_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.sessions (
    id, user_id, subject_id, subject_name, chapter_id, chapter_name,
    syllabus_exam, started_at, ended_at, planned_duration_minutes, status,
    right_count, wrong_count, couldnt_solve_count, timed_question_count,
    active_time_ms, avg_time_per_question_ms
  ) values (
    v_session_id, auth.uid(), p_session ->> 'subject_id',
    p_session ->> 'subject_name', p_session ->> 'chapter_id',
    p_session ->> 'chapter_name', p_session ->> 'syllabus_exam',
    (p_session ->> 'started_at')::timestamptz,
    (p_session ->> 'ended_at')::timestamptz,
    (p_session ->> 'planned_duration_minutes')::integer,
    p_session ->> 'status',
    (p_session ->> 'right_count')::integer,
    (p_session ->> 'wrong_count')::integer,
    (p_session ->> 'couldnt_solve_count')::integer,
    (p_session ->> 'timed_question_count')::integer,
    (p_session ->> 'active_time_ms')::bigint,
    nullif(p_session ->> 'avg_time_per_question_ms', '')::bigint
  )
  on conflict (id) do update set
    subject_id = excluded.subject_id,
    subject_name = excluded.subject_name,
    chapter_id = excluded.chapter_id,
    chapter_name = excluded.chapter_name,
    syllabus_exam = excluded.syllabus_exam,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    planned_duration_minutes = excluded.planned_duration_minutes,
    status = excluded.status,
    right_count = excluded.right_count,
    wrong_count = excluded.wrong_count,
    couldnt_solve_count = excluded.couldnt_solve_count,
    timed_question_count = excluded.timed_question_count,
    active_time_ms = excluded.active_time_ms,
    avg_time_per_question_ms = excluded.avg_time_per_question_ms
  where public.sessions.user_id = (select auth.uid());

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'Session does not belong to the authenticated user';
  end if;

  delete from public.session_weak_topics
  where session_weak_topics.session_id = v_session_id;

  insert into public.session_weak_topics (
    session_id, topic_id, topic_name, question_count
  )
  select
    v_session_id, topics.topic_id, topics.topic_name, topics.question_count
  from jsonb_to_recordset(coalesce(p_weak_topics, '[]'::jsonb))
    as topics(topic_id text, topic_name text, question_count integer);
end;
$$;

revoke all on function public.upsert_session_with_topics(jsonb, jsonb)
  from public, anon;
grant execute on function public.upsert_session_with_topics(jsonb, jsonb)
  to authenticated;

grant select, insert, update on public.sessions to authenticated;
grant select, insert, update, delete on public.session_weak_topics to authenticated;
