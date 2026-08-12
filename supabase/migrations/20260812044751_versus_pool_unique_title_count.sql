-- Expose raw unique shared titles for lobby UI (no eligibility / daily filter).

create or replace function app_private.multiplayer_pool_summary(
  p_room_id uuid,
  p_modes text[]
)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
  select jsonb_build_object(
    'contributor_count', (
      select count(*)::integer
      from app_private.multiplayer_list_contributions contribution
      join app_private.multiplayer_members member
        on member.room_id = contribution.room_id
       and member.user_id = contribution.user_id
      where contribution.room_id = p_room_id and member.is_active
    ),
    -- One shared list is enough to seed the room; extra lists only widen it.
    'required_contributor_count', 1,
    'active_member_count', (
      select count(*)::integer
      from app_private.multiplayer_members member
      where member.room_id = p_room_id and member.is_active
    ),
    'unique_title_count', (
      select count(distinct entry.manhwa_id)::integer
      from app_private.multiplayer_list_contribution_entries entry
      where entry.room_id = p_room_id
    ),
    'per_mode_eligible_counts', coalesce((
      select jsonb_object_agg(selected.mode, (
        select count(distinct entry.manhwa_id)::integer
        from app_private.multiplayer_list_contribution_entries entry
        where entry.room_id = p_room_id
          and exists (
            select 1
            from public.puzzle_pool_entries pool
            where pool.manhwa_id = entry.manhwa_id
              and pool.mode = selected.mode
              and app_private.multiplayer_normalize_clue(
                selected.mode, pool.meta
              ) is not null
          )
          and not exists (
            select 1 from public.daily_puzzles daily
            where daily.date_key = public.current_utc_date_key()
              and daily.answer_id = entry.manhwa_id
          )
      ))
      from unnest(p_modes) selected(mode)
    ), '{}'::jsonb),
    'combined_eligible_count', (
      select count(distinct entry.manhwa_id)::integer
      from app_private.multiplayer_list_contribution_entries entry
      where entry.room_id = p_room_id
        and exists (
          select 1
          from public.puzzle_pool_entries pool
          where pool.manhwa_id = entry.manhwa_id
            and pool.mode = any (p_modes)
            and app_private.multiplayer_normalize_clue(
              pool.mode, pool.meta
            ) is not null
        )
        and not exists (
          select 1 from public.daily_puzzles daily
          where daily.date_key = public.current_utc_date_key()
            and daily.answer_id = entry.manhwa_id
        )
    )
  );
$$;

revoke all on function app_private.multiplayer_pool_summary(uuid, text[])
  from public, anon, authenticated;
grant execute on function app_private.multiplayer_pool_summary(uuid, text[])
  to postgres, service_role;
