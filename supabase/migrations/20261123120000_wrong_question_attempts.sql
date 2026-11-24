-- A source question can be invalid. Keep its timed attempt in history,
-- but do not require a diagnostic cause or treat it as a weakness signal.
alter table public.attempts
  drop constraint if exists attempts_result_check;

alter table public.attempts
  add constraint attempts_result_check
  check (result in ('right', 'wrong', 'couldnt_solve', 'wrong_question'));

alter table public.attempts
  drop constraint if exists attempts_cause_rules;

alter table public.attempts
  add constraint attempts_cause_rules check (
    (result in ('right', 'wrong_question') and cause is null and slip_subtype is null)
    or (result in ('wrong', 'couldnt_solve') and cause is not null)
  );
