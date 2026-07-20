-- Scrub user-facing milestone copy: no em dashes, no UTC in descriptions.

update public.achievement_definitions
set description = 'Finish every required mode on a single day. Party wipe averted.'
where id = 'all_mode_day';

update public.achievement_definitions
set description = 'Visit on 1 day. The sect gates open a crack.'
where id = 'visit_days_1';

update public.achievement_definitions
set description = 'Reach a 2-day all-mode streak. Back-to-back sweeps. The roster believes you now.'
where id = 'all_mode_streak_2';

update public.achievement_definitions
set
  title = 'You came back!',
  description = 'Reach a 2-day any-mode streak. The plot twist is you returned.'
where id = 'any_streak_2';
