alter table public.questions
  add column if not exists difficulty text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'questions_difficulty_check'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_difficulty_check
      check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));
  end if;
end;
$$;
