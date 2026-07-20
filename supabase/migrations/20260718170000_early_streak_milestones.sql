-- Early day-1 / day-2 streak + full-clear milestones (keeps existing awards intact).

insert into public.achievement_definitions
  (id, version, title, description, category, metric, threshold, active, point_reward)
values
  ('any_streak_1', 1, 'Prologue',
   'Reach a 1-day any-mode streak. Tiny arc, big promises.',
   'streak', 'any_max_streak', 1, true, 25),
  ('any_streak_2', 1, 'You came back!',
   'Reach a 2-day any-mode streak. The plot twist is you returned.',
   'streak', 'any_max_streak', 2, true, 25),
  ('all_mode_streak_1', 1, 'Clean Sweep',
   'Reach a 1-day all-mode streak. Every mode. One day. Receipts filed.',
   'all_mode', 'all_max_streak', 1, true, 25),
  ('all_mode_streak_2', 1, 'Double Feature',
   'Reach a 2-day all-mode streak. Back-to-back sweeps. The roster believes you now.',
   'all_mode', 'all_max_streak', 2, true, 25)
on conflict (id) do update set
  version = excluded.version,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  metric = excluded.metric,
  threshold = excluded.threshold,
  active = excluded.active,
  point_reward = excluded.point_reward;
