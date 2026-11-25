-- Persist the selected feedback grace window and the local feedback-commit timestamp.
alter table public.weekly_study_schedules
  add column if not exists feedback_grace_hours integer not null default 6;

alter table public.weekly_study_schedules
  drop constraint if exists weekly_study_schedules_feedback_grace_hours_check;
alter table public.weekly_study_schedules
  add constraint weekly_study_schedules_feedback_grace_hours_check
  check (feedback_grace_hours in (2, 6, 12));

alter table public.sessions
  add column if not exists feedback_submitted_at timestamptz;

