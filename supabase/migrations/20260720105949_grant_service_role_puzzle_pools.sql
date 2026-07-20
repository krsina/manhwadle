-- Pool sync / ensure_daily_puzzles run as service_role via the Data API.
-- Earlier migrations revoked anon/authenticated but never granted service_role,
-- so upserts fail with permission denied even though RLS is bypassed.

grant all on table public.puzzle_pool_entries to service_role;
grant all on table public.daily_puzzles to service_role;
