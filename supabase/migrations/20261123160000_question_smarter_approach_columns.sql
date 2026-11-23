-- Ensure the question-card schema matches the fields written by cloudSync.ts.
-- Safe to run even if the earlier practice-image migration was already applied.
alter table public.questions
  add column if not exists smarter_approach_text text,
  add column if not exists smarter_approach_image_id uuid;

-- PostgREST may cache table metadata after DDL; ask it to refresh.
notify pgrst, 'reload schema';
