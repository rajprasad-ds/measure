-- Invalid-question attempts stay in history but are excluded from valid
-- timed-question totals and active-time metrics.
create or replace function public.upsert_session_with_attempts(
  p_session jsonb,
  p_attempts jsonb,
  p_weak_topics jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid := (p_session ->> 'id')::uuid;
  v_attempt_count integer;
  v_total_attempt_count integer;
  v_right_count integer;
  v_wrong_count integer;
  v_couldnt_solve_count integer;
  v_attempt_time_ms bigint;
  affected_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.sessions (
    id, user_id, subject_id, subject_name, chapter_id, chapter_name,
    syllabus_exam, started_at, ended_at, planned_duration_minutes, status,
    session_kind, right_count, wrong_count, couldnt_solve_count,
    timed_question_count, active_time_ms, avg_time_per_question_ms
  ) values (
    v_session_id, auth.uid(), p_session ->> 'subject_id',
    p_session ->> 'subject_name', p_session ->> 'chapter_id',
    p_session ->> 'chapter_name', p_session ->> 'syllabus_exam',
    (p_session ->> 'started_at')::timestamptz,
    (p_session ->> 'ended_at')::timestamptz,
    (p_session ->> 'planned_duration_minutes')::integer,
    p_session ->> 'status',
    coalesce(p_session ->> 'session_kind', 'practice'),
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
    session_kind = excluded.session_kind,
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

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_attempts, '[]'::jsonb))
      as incoming(session_id uuid)
    where incoming.session_id is distinct from v_session_id
  ) then
    raise exception 'All attempts must belong to the supplied session';
  end if;

  select
    count(*) filter (where incoming.result <> 'wrong_question')::integer,
    count(*)::integer,
    count(*) filter (where incoming.result = 'right')::integer,
    count(*) filter (where incoming.result = 'wrong')::integer,
    count(*) filter (where incoming.result = 'couldnt_solve')::integer,
    coalesce(sum(incoming.time_ms) filter (where incoming.result <> 'wrong_question'), 0)
    into v_attempt_count, v_total_attempt_count, v_right_count, v_wrong_count,
      v_couldnt_solve_count, v_attempt_time_ms
  from jsonb_to_recordset(coalesce(p_attempts, '[]'::jsonb))
    as incoming(id uuid, result text, time_ms bigint);

  if v_attempt_count > 0 and (
    v_attempt_count <> (p_session ->> 'timed_question_count')::integer
    or v_right_count <> (p_session ->> 'right_count')::integer
    or v_wrong_count <> (p_session ->> 'wrong_count')::integer
    or v_couldnt_solve_count <>
      (p_session ->> 'couldnt_solve_count')::integer
    or v_attempt_time_ms <> (p_session ->> 'active_time_ms')::bigint
  ) then
    raise exception 'Session totals do not match its attempts';
  end if;

  insert into public.attempts (
    id, user_id, session_id, question_id, time_ms, result, cause,
    slip_subtype, topic_ids, note, created_at, updated_at
  )
  select
    incoming.id, (select auth.uid()), incoming.session_id,
    incoming.question_id, incoming.time_ms, incoming.result, incoming.cause,
    incoming.slip_subtype, coalesce(incoming.topic_ids, '{}'),
    incoming.note, coalesce(incoming.created_at, now()),
    coalesce(incoming.updated_at, now())
  from jsonb_to_recordset(coalesce(p_attempts, '[]'::jsonb))
    as incoming(
      id uuid,
      session_id uuid,
      question_id uuid,
      time_ms bigint,
      result text,
      cause text,
      slip_subtype text,
      topic_ids text[],
      note text,
      created_at timestamptz,
      updated_at timestamptz
    )
  on conflict (id) do update set
    question_id = excluded.question_id,
    time_ms = excluded.time_ms,
    result = excluded.result,
    cause = excluded.cause,
    slip_subtype = excluded.slip_subtype,
    topic_ids = excluded.topic_ids,
    note = excluded.note,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
  where public.attempts.user_id = (select auth.uid())
    and public.attempts.session_id = excluded.session_id;

  get diagnostics affected_rows = row_count;
  if affected_rows <> v_total_attempt_count then
    raise exception 'One or more attempts could not be saved for this session';
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

revoke all on function public.upsert_session_with_attempts(jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.upsert_session_with_attempts(jsonb, jsonb, jsonb)
  to authenticated;
