-- Free clue advances (reveal more without spending a guess).
alter table public.day_progress
  add column if not exists clue_step integer not null default 0;
