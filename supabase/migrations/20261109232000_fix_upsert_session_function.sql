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
