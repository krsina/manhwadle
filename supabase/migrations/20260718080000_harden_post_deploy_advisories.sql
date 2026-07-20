-- Post-deploy hardening from Supabase security/performance advisors.

-- These account-scoped RPCs must never be callable anonymously.
revoke all on function public.get_my_leaderboard_standing() from anon;
revoke all on function public.get_my_achievements() from anon;
revoke all on function public.get_my_today_mode_completions() from anon;

-- Evaluate auth.uid() once per statement instead of once per row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id and public.not_cloud_banned())
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

drop policy if exists player_stats_select_own on public.player_stats;
create policy player_stats_select_own
  on public.player_stats for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists player_stats_insert_own on public.player_stats;
create policy player_stats_insert_own
  on public.player_stats for insert to authenticated
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

drop policy if exists player_stats_update_own on public.player_stats;
create policy player_stats_update_own
  on public.player_stats for update to authenticated
  using ((select auth.uid()) = user_id and public.not_cloud_banned())
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

drop policy if exists day_progress_select_own on public.day_progress;
create policy day_progress_select_own
  on public.day_progress for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists day_progress_insert_own on public.day_progress;
create policy day_progress_insert_own
  on public.day_progress for insert to authenticated
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

drop policy if exists day_progress_update_own on public.day_progress;
create policy day_progress_update_own
  on public.day_progress for update to authenticated
  using ((select auth.uid()) = user_id and public.not_cloud_banned())
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

drop policy if exists daily_completions_select_own on public.daily_completions;
create policy daily_completions_select_own
  on public.daily_completions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists public_profiles_select_own on public.public_profiles;
create policy public_profiles_select_own
  on public.public_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own
  on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
  on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id and public.not_cloud_banned())
  with check ((select auth.uid()) = user_id and public.not_cloud_banned());

-- Cover moderation/status foreign keys that are used during user deletion and audit queries.
create index if not exists account_flags_updated_by_idx
  on app_private.account_flags (updated_by);
create index if not exists account_restrictions_created_by_idx
  on app_private.account_restrictions (created_by);
create index if not exists account_restrictions_revoked_by_idx
  on app_private.account_restrictions (revoked_by);
create index if not exists blocked_identities_created_by_idx
  on app_private.blocked_identities (created_by);
create index if not exists moderation_actions_actor_idx
  on app_private.moderation_actions (actor_id);
create index if not exists user_reports_target_user_idx
  on app_private.user_reports (target_user_id);
create index if not exists user_roles_granted_by_idx
  on app_private.user_roles (granted_by);
create index if not exists mode_outage_exemptions_created_by_idx
  on public.mode_outage_exemptions (created_by);
create index if not exists mode_status_updated_by_idx
  on public.mode_status (updated_by);
create index if not exists site_status_updated_by_idx
  on public.site_status (updated_by);
create index if not exists user_achievements_achievement_idx
  on public.user_achievements (achievement_id);
