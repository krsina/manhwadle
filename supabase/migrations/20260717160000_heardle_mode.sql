-- Allow Heardle mode on synced player stats / day progress.
alter table public.player_stats
  drop constraint if exists player_stats_mode_check;

alter table public.player_stats
  add constraint player_stats_mode_check
  check (mode = any (array[
    'summary'::text,
    'character'::text,
    'cover'::text,
    'heardle'::text
  ]));

alter table public.day_progress
  drop constraint if exists day_progress_mode_check;

alter table public.day_progress
  add constraint day_progress_mode_check
  check (mode = any (array[
    'summary'::text,
    'character'::text,
    'cover'::text,
    'heardle'::text
  ]));
