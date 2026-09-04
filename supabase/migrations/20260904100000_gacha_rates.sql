-- Banner rates: common 45%, rare 34%, epic 20%, legendary 1%.
-- Pity, cost, and pool picking stay the same as 20260904080000_gacha_shop.

create or replace function public.pull_gacha()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_state public.user_gacha_state%rowtype;
  v_next integer;
  v_rand double precision;
  v_rarity text;
  v_item_id text;
  v_owned_before integer := 0;
  v_is_new boolean;
  v_points jsonb;
  v_copies integer;
  v_balance integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;

  perform app_private.ensure_shop_account(v_uid);
  perform app_private.ensure_gacha_state(v_uid);
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('shop_points'));

  select coalesce(balance, 0) into v_balance
  from public.user_point_balances
  where user_id = v_uid;
  if v_balance < 400 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end if;
  if not app_private.consume_rpc_rate_limit(v_uid, 'pull_gacha', 20, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_state
  from public.user_gacha_state
  where user_id = v_uid
  for update;

  v_next := v_state.pull_count + 1;
  if v_next % 40 = 0 then
    v_rarity := 'epic';
  else
    v_rand := random();
    if v_rand < 0.45 then
      v_rarity := 'common';
    elsif v_rand < 0.79 then
      v_rarity := 'rare';
    elsif v_rand < 0.99 then
      v_rarity := 'epic';
    else
      v_rarity := 'legendary';
    end if;
    if v_state.pulls_since_rare_plus >= 9 and v_rarity = 'common' then
      v_rarity := 'rare';
    end if;
  end if;

  v_item_id := app_private.gacha_pick_id(v_rarity);
  if v_item_id is null then
    return jsonb_build_object('ok', false, 'error', 'empty_pool');
  end if;

  begin
    v_points := app_private.apply_point_transaction(
      v_uid,
      -400,
      'gacha_pull',
      'gacha_pull:' || gen_random_uuid()::text,
      jsonb_build_object('item_id', v_item_id, 'rarity', v_rarity, 'pull_count', v_next)
    );
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end;

  if not coalesce((v_points ->> 'applied')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'purchase_conflict');
  end if;

  select coalesce(copies, 0) into v_owned_before
  from public.user_gacha_copies
  where user_id = v_uid and item_id = v_item_id;

  v_is_new := v_owned_before < 1
    and v_item_id not in ('avatar_default_female', 'avatar_default_male');
  v_copies := app_private.grant_gacha_copy(v_uid, v_item_id);

  update public.user_gacha_state
  set pull_count = v_next,
      pulls_since_rare_plus = case
        when v_rarity in ('rare', 'epic', 'legendary') then 0
        else v_state.pulls_since_rare_plus + 1
      end,
      last_character_id = v_item_id,
      last_rarity = v_rarity,
      last_is_new = v_is_new,
      updated_at = timezone('utc', now())
  where user_id = v_uid;

  return app_private.gacha_snapshot(v_uid) || jsonb_build_object(
    'ok', true,
    'character_id', v_item_id,
    'rarity', v_rarity,
    'is_new', v_is_new,
    'copies', v_copies
  );
end;
$$;
