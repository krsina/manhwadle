-- Heardle becomes a footer-only side mode: still playable, but no longer part of
-- the daily set required for all-mode streaks.
--
-- daily_mode_requirements snapshots are immutable, so UTC dates that already have a
-- snapshot keep their original requirements. Every date snapshotted after this runs
-- (via the puzzle insert trigger) requires only Summary, Character, and Cover.
update public.mode_status
set
  required_for_all_mode = false,
  updated_at = timezone('utc', now())
where mode = 'heardle'
  and required_for_all_mode;

-- Perfect Week copy no longer assumes four required modes.
update public.achievement_definitions
set description = 'Reach a 7-day all-mode streak. Every daily mode. Seven days. Zero excuses.'
where id = 'all_mode_streak_7'
  and description = 'Reach a 7-day all-mode streak. Four modes. Seven days. Zero excuses.';
