-- Per-account recurring weekly Study Interval schedule.
-- Daily snapshots remain device-local and immutable for their calendar date.

create table if not exists public.weekly_study_schedules (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schedule jsonb not null,
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now(),
  constraint weekly_study_schedules_schedule_is_object
    check (jsonb_typeof(schedule) = 'object')
);

alter table public.weekly_study_schedules enable row level security;

drop policy if exists "Weekly study schedules select own"
  on public.weekly_study_schedules;
create policy "Weekly study schedules select own"
  on public.weekly_study_schedules
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Weekly study schedules insert own"
  on public.weekly_study_schedules;
create policy "Weekly study schedules insert own"
  on public.weekly_study_schedules
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Weekly study schedules update own"
  on public.weekly_study_schedules;
create policy "Weekly study schedules update own"
  on public.weekly_study_schedules
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Weekly study schedules delete own"
  on public.weekly_study_schedules;
create policy "Weekly study schedules delete own"
  on public.weekly_study_schedules
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.weekly_study_schedules to authenticated;

create index if not exists weekly_study_schedules_updated_idx
  on public.weekly_study_schedules (updated_at desc);
