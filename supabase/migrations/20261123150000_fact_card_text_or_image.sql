alter table public.fact_cards
  drop constraint if exists fact_cards_have_prompt;
alter table public.fact_cards
  add constraint fact_cards_have_prompt check (
    nullif(btrim(prompt_text), '') is not null or prompt_image_id is not null
  );

alter table public.fact_cards
  drop constraint if exists fact_cards_have_content;
alter table public.fact_cards
  add constraint fact_cards_have_content check (
    nullif(btrim(content_text), '') is not null or content_image_id is not null
  );
