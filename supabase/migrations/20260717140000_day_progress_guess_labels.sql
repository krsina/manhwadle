-- Parallel title forms for each guess id (alias or primary as shown in UI).
alter table public.day_progress
  add column if not exists guess_labels text[] not null default '{}'::text[];
