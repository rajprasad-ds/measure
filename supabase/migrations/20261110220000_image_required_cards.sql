-- Require images on card prompts/answers (image-first design).
-- Run after 20261110213000_practice_image_cards.sql.

alter table public.questions
  drop constraint if exists questions_has_prompt;
alter table public.questions
  add constraint questions_has_prompt check (prompt_image_id is not null);

alter table public.fact_cards
  drop constraint if exists fact_cards_have_prompt;
alter table public.fact_cards
  add constraint fact_cards_have_prompt check (prompt_image_id is not null);

alter table public.fact_cards
  drop constraint if exists fact_cards_have_content;
alter table public.fact_cards
  add constraint fact_cards_have_content check (content_image_id is not null);