alter table public.questions
  add column if not exists solution_image_ids uuid[] not null default '{}';

update public.questions
set solution_image_ids = array[solution_image_id]
where solution_image_id is not null
  and cardinality(solution_image_ids) = 0;
