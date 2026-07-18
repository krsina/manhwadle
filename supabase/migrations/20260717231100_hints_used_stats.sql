-- Lifetime free hint reveals on synced stats, plus per-day free hint count.
alter table public.player_stats
  add column if not exists hints_used integer not null default 0
  check (hints_used >= 0);

alter table public.day_progress
  add column if not exists hints_used integer not null default 0
  check (hints_used >= 0);
