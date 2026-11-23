-- Align the question solution constraint with the current card model.
-- The current app supports multiple solution images and smarter-approach content.
alter table public.questions
  drop constraint if exists questions_has_solution;

alter table public.questions
  add constraint questions_has_solution check (
    nullif(btrim(solution_text), '') is not null
    or nullif(btrim(key_insight), '') is not null
    or solution_image_id is not null
    or cardinality(solution_image_ids) > 0
    or nullif(btrim(smarter_approach_text), '') is not null
    or smarter_approach_image_id is not null
  );

notify pgrst, 'reload schema';
