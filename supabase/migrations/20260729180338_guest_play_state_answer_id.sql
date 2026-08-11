-- Guest (anon) Wordle-style play: return today's answer_id from play state so
-- local guess validation stays 1:1 with the live daily even when the public
-- fingerprint is ambiguous. Authenticated callers still omit answer_id until
-- the attempt is terminal (ranked integrity unchanged).

create or replace function public.get_daily_play_state(
  p_mode text,
  p_taste text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_answer_id integer;
  v_character_id integer;
  v_meta jsonb;
  v_attempt app_private.daily_attempts%rowtype;
  v_mode_available boolean;
  v_guest boolean := (v_uid is null);
begin
  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;
  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    return jsonb_build_object('ok', false, 'error', 'invalid_taste');
  end if;

  select ms.available into v_mode_available
  from public.mode_status ms
  where ms.mode = p_mode;

  if coalesce(v_mode_available, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'mode_unavailable');
  end if;

  perform public.ensure_daily_puzzles(v_date_key);

  select dp.answer_id, dp.character_id, dp.meta
  into v_answer_id, v_character_id, v_meta
  from public.daily_puzzles dp
  where dp.date_key = v_date_key
    and dp.mode = p_mode
    and dp.taste = p_taste;

  if v_answer_id is null then
    return jsonb_build_object('ok', false, 'error', 'puzzle_unavailable');
  end if;

  if v_uid is not null then
    select * into v_attempt
    from app_private.daily_attempts da
    where da.user_id = v_uid
      and da.date_key = v_date_key
      and da.mode = p_mode;
  end if;

  return jsonb_build_object(
    'ok', true,
    'date_key', v_date_key,
    'mode', p_mode,
    'taste', p_taste,
    'meta', app_private.daily_play_public_meta(v_meta),
    'max_guesses', 6,
    -- Guests validate locally against the live daily (Wordle-style).
    'answer_id', case when v_guest then v_answer_id else null end,
    'character_id', case when v_guest then v_character_id else null end,
    'attempt', case
      when v_attempt.id is null then null
      else app_private.daily_attempt_public_state(v_attempt)
    end
  );
end;
$$;

comment on function public.get_daily_play_state(text, text) is
  'Today play state. Guests (anon) receive answer_id for local validation; authenticated callers omit answer_id until the attempt is terminal. Optional attempt snapshot when authenticated.';

revoke all on function public.get_daily_play_state(text, text) from public;
grant execute on function public.get_daily_play_state(text, text)
  to anon, authenticated, service_role;
