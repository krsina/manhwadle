-- Server-authoritative daily play, bonus-name validation, ad/secret economy hardening.
-- Goals:
--   1) Hide today's answer_id from direct SELECT (archive/past remains readable).
--   2) Authenticated attempt → guess → finalize flow; XP only from server-held attempts.
--   3) Deprecate fabricated-history completion RPCs for clients (compat JSON errors).
--   4) Bonus-name: validate guess material server-side (no trusted boolean).
--   5) Rewarded-ad DB claims disabled until provider verification exists.
--   6) Client-only secret events are cosmetic (no economic points).

-- ---------------------------------------------------------------------------
-- Helpers: public play meta (strip private bonus validation fields)
-- ---------------------------------------------------------------------------

create or replace function app_private.daily_play_public_meta(p_meta jsonb)
returns jsonb
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select case
    when p_meta is null then null
    when not (p_meta ? 'public_clue')
      or not (p_meta ? 'answer_fingerprint') then null
    else jsonb_build_object(
      'clue', p_meta -> 'public_clue',
      'fingerprint', p_meta -> 'answer_fingerprint'
    )
  end;
$$;

revoke all on function app_private.daily_play_public_meta(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.daily_play_public_meta(jsonb)
  to postgres, service_role;

create or replace function app_private.normalize_bonus_guess_label(p_label text)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select nullif(
    lower(
      regexp_replace(
        trim(coalesce(p_label, '')),
        '[^a-z0-9]+',
        '',
        'g'
      )
    ),
    ''
  );
$$;

revoke all on function app_private.normalize_bonus_guess_label(text)
  from public, anon, authenticated;
grant execute on function app_private.normalize_bonus_guess_label(text)
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- ensure_daily_puzzles: persist pool meta (incl. future bonus fields)
-- ---------------------------------------------------------------------------

create or replace function public.ensure_daily_puzzles(p_date_key text default null)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  dkey text := coalesce(p_date_key, public.current_utc_date_key());
  lane record;
  pool_size int;
  idx int;
  answer int;
  char_id int;
  seed text;
  entry_meta jsonb;
  clue_idx int;
  clue_count int;
  selected_clue jsonb;
  inserted int := 0;
begin
  for lane in
    select m.mode, t.taste
    from (values ('summary'), ('character'), ('cover'), ('heardle')) as m(mode)
    cross join (values ('action'), ('romance'), ('both')) as t(taste)
  loop
    if exists (
      select 1 from public.daily_puzzles dp
      where dp.date_key = dkey and dp.mode = lane.mode and dp.taste = lane.taste
    ) then
      continue;
    end if;

    select count(*)::int into pool_size
    from public.puzzle_pool_entries p
    where p.mode = lane.mode and p.taste = lane.taste;

    if coalesce(pool_size, 0) = 0 then
      continue;
    end if;

    seed := 'manhwadle:' || lane.mode || ':' || lane.taste;
    idx := public.daily_index(dkey, pool_size, seed);

    select p.manhwa_id, p.character_id, p.meta
    into answer, char_id, entry_meta
    from public.puzzle_pool_entries p
    where p.mode = lane.mode and p.taste = lane.taste and p.position = idx;

    if lane.mode = 'character'
       and entry_meta is not null
       and entry_meta ? 'character_clues'
       and jsonb_typeof(entry_meta->'character_clues') = 'array'
       and jsonb_array_length(entry_meta->'character_clues') > 0
    then
      clue_count := jsonb_array_length(entry_meta->'character_clues');
      clue_idx := (public.hash_string(seed || '-char-' || dkey || '-' || answer::text)
                   % clue_count)::int;
      selected_clue := entry_meta->'character_clues'->clue_idx;
      char_id := nullif(selected_clue->>'character_id', '')::integer;
      entry_meta := jsonb_set(
        entry_meta,
        '{public_clue}',
        (selected_clue - 'character_id') || jsonb_build_object('type', 'character'),
        true
      );
    elsif lane.mode = 'heardle'
       and entry_meta is not null
       and entry_meta ? 'heardle_clues'
       and jsonb_typeof(entry_meta->'heardle_clues') = 'array'
       and jsonb_array_length(entry_meta->'heardle_clues') > 0
    then
      clue_count := jsonb_array_length(entry_meta->'heardle_clues');
      clue_idx := (public.hash_string(seed || '-song-' || dkey || '-' || answer::text)
                   % clue_count)::int;
      selected_clue := entry_meta->'heardle_clues'->clue_idx;
      entry_meta := jsonb_set(
        entry_meta,
        '{public_clue}',
        selected_clue || jsonb_build_object('type', 'heardle'),
        true
      );
    end if;

    insert into public.daily_puzzles (date_key, mode, taste, answer_id, character_id, meta)
    values (dkey, lane.mode, lane.taste, answer, char_id, entry_meta)
    on conflict do nothing;

    inserted := inserted + 1;
  end loop;

  return inserted;
end;
$$;

revoke all on function public.ensure_daily_puzzles(text) from public, anon, authenticated;
grant execute on function public.ensure_daily_puzzles(text) to service_role;

-- ---------------------------------------------------------------------------
-- daily_puzzles: past/archive SELECT only (no today answer_id via table)
-- ---------------------------------------------------------------------------

drop policy if exists daily_puzzles_select_past_and_today on public.daily_puzzles;
drop policy if exists daily_puzzles_select_past on public.daily_puzzles;

create policy daily_puzzles_select_past
  on public.daily_puzzles
  for select
  to anon, authenticated
  using (date_key < public.current_utc_date_key());

revoke all on table public.daily_puzzles from public, anon, authenticated;
grant select on table public.daily_puzzles to anon, authenticated;
grant all on table public.daily_puzzles to service_role;

comment on table public.daily_puzzles is
  'Daily puzzle lanes. Clients may SELECT past/archive rows only; today is served via clue-safe RPCs without answer_id.';

-- ---------------------------------------------------------------------------
-- Attempt storage (private)
-- ---------------------------------------------------------------------------

create table if not exists app_private.daily_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  mode text not null
    check (mode = any (array[
      'summary'::text,
      'character'::text,
      'cover'::text,
      'heardle'::text
    ])),
  taste text not null
    check (taste = any (array[
      'action'::text,
      'romance'::text,
      'both'::text
    ])),
  hard_mode boolean not null default false,
  hints_used integer not null default 0
    check (hints_used >= 0 and hints_used <= 6),
  guess_ids integer[] not null default '{}'::integer[],
  max_guesses integer not null default 6
    check (max_guesses = 6),
  status text not null default 'active'
    check (status = any (array[
      'active'::text,
      'won'::text,
      'lost'::text,
      'surrendered'::text
    ])),
  answer_id integer not null,
  character_id integer,
  puzzle_meta jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_attempts_user_date_mode_key unique (user_id, date_key, mode),
  constraint daily_attempts_guess_len_check
    check (cardinality(guess_ids) <= max_guesses)
);

create index if not exists daily_attempts_user_date_idx
  on app_private.daily_attempts (user_id, date_key);

alter table app_private.daily_attempts enable row level security;
revoke all on table app_private.daily_attempts
  from public, anon, authenticated;
grant all on table app_private.daily_attempts to postgres, service_role;

create table if not exists app_private.daily_attempt_idempotency (
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key text not null,
  mode text not null,
  op text not null,
  idempotency_key text not null,
  response jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, date_key, mode, op, idempotency_key)
);

alter table app_private.daily_attempt_idempotency enable row level security;
revoke all on table app_private.daily_attempt_idempotency
  from public, anon, authenticated;
grant all on table app_private.daily_attempt_idempotency to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Attempt helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.daily_attempt_public_state(
  p_attempt app_private.daily_attempts
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_terminal boolean := p_attempt.status is distinct from 'active';
begin
  return jsonb_build_object(
    'date_key', p_attempt.date_key,
    'mode', p_attempt.mode,
    'taste', p_attempt.taste,
    'hard_mode', p_attempt.hard_mode,
    'hints_used', p_attempt.hints_used,
    'guess_ids', to_jsonb(p_attempt.guess_ids),
    'guess_count', coalesce(cardinality(p_attempt.guess_ids), 0),
    'max_guesses', p_attempt.max_guesses,
    'status', p_attempt.status,
    'character_id', case when v_terminal then p_attempt.character_id else null end,
    'meta', app_private.daily_play_public_meta(p_attempt.puzzle_meta),
    'answer_id', case when v_terminal then p_attempt.answer_id else null end,
    'finalized_at', p_attempt.finalized_at
  );
end;
$$;

revoke all on function app_private.daily_attempt_public_state(app_private.daily_attempts)
  from public, anon, authenticated;
grant execute on function app_private.daily_attempt_public_state(app_private.daily_attempts)
  to postgres, service_role;

create or replace function app_private.insert_completion_from_attempt(
  p_attempt app_private.daily_attempts
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_outcome text;
  v_surrendered boolean := p_attempt.status = 'surrendered';
  v_existing public.daily_completions%rowtype;
  v_inserted boolean := false;
  v_balance_before integer := 0;
  v_balance integer := 0;
  v_delta integer := 0;
  v_play_delta integer := 0;
begin
  if p_attempt.status = 'won' then
    v_outcome := 'won';
  else
    v_outcome := 'lost';
  end if;

  select *
  into v_existing
  from public.daily_completions dc
  where dc.user_id = p_attempt.user_id
    and dc.date_key = p_attempt.date_key
    and dc.mode = p_attempt.mode;

  if found then
    select balance into v_balance
    from public.user_point_balances
    where user_id = p_attempt.user_id;

    return jsonb_build_object(
      'ok', true,
      'inserted', false,
      'date_key', v_existing.date_key,
      'mode', v_existing.mode,
      'taste', v_existing.taste,
      'outcome', v_existing.outcome,
      'guess_count', v_existing.guess_count,
      'hints_used', v_existing.hints_used,
      'hard_mode', v_existing.hard_mode,
      'surrendered', v_existing.surrendered,
      'answer_id', v_existing.answer_id,
      'character_id', v_existing.character_id,
      'completed_at', v_existing.completed_at,
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', coalesce(v_balance, 0)
    );
  end if;

  perform app_private.ensure_shop_account(p_attempt.user_id);
  select balance into v_balance_before
  from public.user_point_balances
  where user_id = p_attempt.user_id;

  begin
    insert into public.daily_completions (
      user_id,
      date_key,
      mode,
      taste,
      outcome,
      guess_count,
      hints_used,
      hard_mode,
      surrendered,
      answer_id,
      character_id,
      guess_ids,
      max_guesses
    ) values (
      p_attempt.user_id,
      p_attempt.date_key,
      p_attempt.mode,
      p_attempt.taste,
      v_outcome,
      coalesce(cardinality(p_attempt.guess_ids), 0),
      p_attempt.hints_used,
      p_attempt.hard_mode,
      v_surrendered,
      p_attempt.answer_id,
      p_attempt.character_id,
      p_attempt.guess_ids,
      p_attempt.max_guesses
    )
    returning * into v_existing;
    v_inserted := true;
  exception
    when unique_violation then
      select *
      into v_existing
      from public.daily_completions dc
      where dc.user_id = p_attempt.user_id
        and dc.date_key = p_attempt.date_key
        and dc.mode = p_attempt.mode;
      v_inserted := false;
  end;

  select balance into v_balance
  from public.user_point_balances
  where user_id = p_attempt.user_id;

  if v_inserted then
    v_delta := greatest(coalesce(v_balance, 0) - coalesce(v_balance_before, 0), 0);
    select coalesce(sum(pt.delta), 0)::integer
    into v_play_delta
    from app_private.point_transactions pt
    where pt.user_id = p_attempt.user_id
      and pt.source_type in ('daily_completion', 'all_modes_day')
      and (
        (pt.source_type = 'daily_completion'
          and pt.source_id = p_attempt.date_key || ':' || p_attempt.mode)
        or (pt.source_type = 'all_modes_day' and pt.source_id = p_attempt.date_key)
      );
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'date_key', v_existing.date_key,
    'mode', v_existing.mode,
    'taste', v_existing.taste,
    'outcome', v_existing.outcome,
    'guess_count', v_existing.guess_count,
    'hints_used', v_existing.hints_used,
    'hard_mode', v_existing.hard_mode,
    'surrendered', v_existing.surrendered,
    'answer_id', v_existing.answer_id,
    'character_id', v_existing.character_id,
    'completed_at', v_existing.completed_at,
    'point_delta', coalesce(v_delta, 0),
    'play_point_delta', coalesce(v_play_delta, 0),
    'points_balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function app_private.insert_completion_from_attempt(app_private.daily_attempts)
  from public, anon, authenticated;
grant execute on function app_private.insert_completion_from_attempt(app_private.daily_attempts)
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Public: clue-safe today play state (no answer_id)
-- ---------------------------------------------------------------------------

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
    'attempt', case
      when v_attempt.id is null then null
      else app_private.daily_attempt_public_state(v_attempt)
    end
  );
end;
$$;

comment on function public.get_daily_play_state(text, text) is
  'Clue-safe today play state. Never returns answer_id. Optional attempt snapshot when authenticated.';

revoke all on function public.get_daily_play_state(text, text) from public;
grant execute on function public.get_daily_play_state(text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public: start / resume authenticated attempt
-- ---------------------------------------------------------------------------

create or replace function public.start_daily_attempt(
  p_mode text,
  p_taste text,
  p_hard_mode boolean default false,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_hard boolean := coalesce(p_hard_mode, false);
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_cached jsonb;
  v_answer_id integer;
  v_character_id integer;
  v_meta jsonb;
  v_attempt app_private.daily_attempts%rowtype;
  v_mode_available boolean;
  v_completion public.daily_completions%rowtype;
  v_response jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;
  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;
  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    return jsonb_build_object('ok', false, 'error', 'invalid_taste');
  end if;

  if not app_private.consume_rpc_rate_limit(v_uid, 'start_daily_attempt', 20, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if v_key is not null then
    select response into v_cached
    from app_private.daily_attempt_idempotency
    where user_id = v_uid
      and date_key = v_date_key
      and mode = p_mode
      and op = 'start'
      and idempotency_key = v_key;
    if found then
      return v_cached;
    end if;
  end if;

  select *
  into v_completion
  from public.daily_completions dc
  where dc.user_id = v_uid
    and dc.date_key = v_date_key
    and dc.mode = p_mode;

  if found then
    v_response := jsonb_build_object(
      'ok', true,
      'created', false,
      'already_completed', true,
      'date_key', v_completion.date_key,
      'mode', v_completion.mode,
      'taste', v_completion.taste,
      'outcome', v_completion.outcome,
      'guess_count', v_completion.guess_count,
      'hints_used', v_completion.hints_used,
      'hard_mode', v_completion.hard_mode,
      'surrendered', v_completion.surrendered,
      'answer_id', v_completion.answer_id,
      'character_id', v_completion.character_id,
      'completed_at', v_completion.completed_at,
      'status', case
        when v_completion.outcome = 'won' then 'won'
        when v_completion.surrendered then 'surrendered'
        else 'lost'
      end,
      'max_guesses', v_completion.max_guesses,
      'guess_ids', to_jsonb(v_completion.guess_ids)
    );
  else
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

    insert into app_private.daily_attempts (
      user_id, date_key, mode, taste, hard_mode,
      answer_id, character_id, puzzle_meta
    ) values (
      v_uid, v_date_key, p_mode, p_taste, v_hard,
      v_answer_id, v_character_id, v_meta
    )
    on conflict (user_id, date_key, mode) do nothing
    returning * into v_attempt;

    if not found then
      select * into v_attempt
      from app_private.daily_attempts da
      where da.user_id = v_uid
        and da.date_key = v_date_key
        and da.mode = p_mode;

      v_response := jsonb_build_object(
        'ok', true,
        'created', false,
        'already_completed', false,
        'attempt', app_private.daily_attempt_public_state(v_attempt)
      );
    else
      v_response := jsonb_build_object(
        'ok', true,
        'created', true,
        'already_completed', false,
        'attempt', app_private.daily_attempt_public_state(v_attempt)
      );
    end if;

    -- Taste locked to first start; reject mismatched resume.
    if v_attempt.taste is distinct from p_taste then
      return jsonb_build_object(
        'ok', false,
        'error', 'taste_locked',
        'attempt', app_private.daily_attempt_public_state(v_attempt)
      );
    end if;
  end if;

  if v_key is not null then
    insert into app_private.daily_attempt_idempotency (
      user_id, date_key, mode, op, idempotency_key, response
    ) values (
      v_uid, v_date_key, p_mode, 'start', v_key, v_response
    )
    on conflict do nothing;
  end if;

  return v_response;
end;
$$;

comment on function public.start_daily_attempt(text, text, boolean, text) is
  'Start or resume today''s authenticated attempt. Locks answer server-side; response omits answer_id until terminal.';

revoke all on function public.start_daily_attempt(text, text, boolean, text) from public, anon;
grant execute on function public.start_daily_attempt(text, text, boolean, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public: submit one guess (rate-limited, idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.submit_daily_guess(
  p_mode text,
  p_taste text,
  p_guess_id integer,
  p_hints_used integer default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_cached jsonb;
  v_attempt app_private.daily_attempts%rowtype;
  v_correct boolean := false;
  v_count integer;
  v_completion jsonb;
  v_response jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;
  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;
  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    return jsonb_build_object('ok', false, 'error', 'invalid_taste');
  end if;
  if p_guess_id is null or p_guess_id <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_guess_id');
  end if;

  if not app_private.consume_rpc_rate_limit(v_uid, 'submit_daily_guess', 30, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if v_key is not null then
    select response into v_cached
    from app_private.daily_attempt_idempotency
    where user_id = v_uid
      and date_key = v_date_key
      and mode = p_mode
      and op = 'guess'
      and idempotency_key = v_key;
    if found then
      -- Older deployments cached already_terminal without repairing/returning
      -- completion. Let that one shape fall through to the repair branch.
      if coalesce(v_cached ->> 'reason', '') is distinct from 'already_terminal'
         or v_cached ? 'completion' then
        return v_cached;
      end if;
    end if;
  end if;

  select * into v_attempt
  from app_private.daily_attempts da
  where da.user_id = v_uid
    and da.date_key = v_date_key
    and da.mode = p_mode
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'attempt_required');
  end if;

  if v_attempt.taste is distinct from p_taste then
    return jsonb_build_object('ok', false, 'error', 'taste_locked');
  end if;

  if v_attempt.status is distinct from 'active' then
    v_completion := app_private.insert_completion_from_attempt(v_attempt);
    v_response := jsonb_build_object(
      'ok', true,
      'accepted', false,
      'reason', 'already_terminal',
      'correct', false,
      'attempt', app_private.daily_attempt_public_state(v_attempt),
      'completion', v_completion,
      'finalized', true
    );
  elsif p_guess_id = any (v_attempt.guess_ids) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_guess');
  elsif coalesce(cardinality(v_attempt.guess_ids), 0) >= v_attempt.max_guesses then
    return jsonb_build_object('ok', false, 'error', 'max_guesses');
  else
    if p_hints_used is not null then
      if p_hints_used < v_attempt.hints_used or p_hints_used > v_attempt.max_guesses then
        return jsonb_build_object('ok', false, 'error', 'invalid_hints_used');
      end if;
      v_attempt.hints_used := p_hints_used;
    end if;

    v_attempt.guess_ids := array_append(v_attempt.guess_ids, p_guess_id);
    v_count := cardinality(v_attempt.guess_ids);
    v_correct := (p_guess_id = v_attempt.answer_id);

    if v_correct then
      v_attempt.status := 'won';
      v_attempt.finalized_at := timezone('utc', now());
    elsif v_count >= v_attempt.max_guesses then
      v_attempt.status := 'lost';
      v_attempt.finalized_at := timezone('utc', now());
    end if;

    update app_private.daily_attempts
    set
      guess_ids = v_attempt.guess_ids,
      hints_used = v_attempt.hints_used,
      status = v_attempt.status,
      finalized_at = v_attempt.finalized_at,
      updated_at = timezone('utc', now())
    where id = v_attempt.id
    returning * into v_attempt;

    v_response := jsonb_build_object(
      'ok', true,
      'accepted', true,
      'correct', v_correct,
      'guess_id', p_guess_id,
      'guess_count', v_count,
      'attempt', app_private.daily_attempt_public_state(v_attempt)
    );

    if v_attempt.status is distinct from 'active' then
      v_completion := app_private.insert_completion_from_attempt(v_attempt);
      v_response := v_response || jsonb_build_object(
        'completion', v_completion,
        'finalized', true
      );
    else
      v_response := v_response || jsonb_build_object('finalized', false);
    end if;
  end if;

  if v_key is not null then
    insert into app_private.daily_attempt_idempotency (
      user_id, date_key, mode, op, idempotency_key, response
    ) values (
      v_uid, v_date_key, p_mode, 'guess', v_key, v_response
    )
    on conflict (user_id, date_key, mode, op, idempotency_key)
    do update set response = excluded.response;
  end if;

  return v_response;
end;
$$;

comment on function public.submit_daily_guess(text, text, integer, integer, text) is
  'Append one authenticated guess to the server attempt. Auto-finalizes on win or max guesses; awards XP only then.';

revoke all on function public.submit_daily_guess(text, text, integer, integer, text)
  from public, anon;
grant execute on function public.submit_daily_guess(text, text, integer, integer, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public: finalize (surrender / explicit terminal)
-- ---------------------------------------------------------------------------

create or replace function public.finalize_daily_attempt(
  p_mode text,
  p_taste text,
  p_surrendered boolean default false,
  p_hints_used integer default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_cached jsonb;
  v_attempt app_private.daily_attempts%rowtype;
  v_surrendered boolean := coalesce(p_surrendered, false);
  v_completion jsonb;
  v_response jsonb;
  v_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if app_private.is_cloud_banned(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'cloud_banned');
  end if;
  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;
  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    return jsonb_build_object('ok', false, 'error', 'invalid_taste');
  end if;

  if not app_private.consume_rpc_rate_limit(v_uid, 'finalize_daily_attempt', 20, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if v_key is not null then
    select response into v_cached
    from app_private.daily_attempt_idempotency
    where user_id = v_uid
      and date_key = v_date_key
      and mode = p_mode
      and op = 'finalize'
      and idempotency_key = v_key;
    if found then
      return v_cached;
    end if;
  end if;

  select * into v_attempt
  from app_private.daily_attempts da
  where da.user_id = v_uid
    and da.date_key = v_date_key
    and da.mode = p_mode
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'attempt_required');
  end if;

  if v_attempt.taste is distinct from p_taste then
    return jsonb_build_object('ok', false, 'error', 'taste_locked');
  end if;

  if v_attempt.status is distinct from 'active' then
    v_completion := app_private.insert_completion_from_attempt(v_attempt);
    v_response := jsonb_build_object(
      'ok', true,
      'finalized', true,
      'already_terminal', true,
      'attempt', app_private.daily_attempt_public_state(v_attempt),
      'completion', v_completion
    );
  else
    if p_hints_used is not null then
      if p_hints_used < v_attempt.hints_used or p_hints_used > v_attempt.max_guesses then
        return jsonb_build_object('ok', false, 'error', 'invalid_hints_used');
      end if;
      v_attempt.hints_used := p_hints_used;
    end if;

    v_count := coalesce(cardinality(v_attempt.guess_ids), 0);

    if v_surrendered then
      if v_count >= v_attempt.max_guesses then
        return jsonb_build_object('ok', false, 'error', 'surrender_requires_remaining_guesses');
      end if;
      if v_attempt.answer_id = any (v_attempt.guess_ids) then
        return jsonb_build_object('ok', false, 'error', 'cannot_surrender_after_correct');
      end if;
      v_attempt.status := 'surrendered';
    else
      if v_count < v_attempt.max_guesses then
        return jsonb_build_object('ok', false, 'error', 'not_terminal');
      end if;
      if v_attempt.answer_id = any (v_attempt.guess_ids) then
        v_attempt.status := 'won';
      else
        v_attempt.status := 'lost';
      end if;
    end if;

    v_attempt.finalized_at := timezone('utc', now());

    update app_private.daily_attempts
    set
      hints_used = v_attempt.hints_used,
      status = v_attempt.status,
      finalized_at = v_attempt.finalized_at,
      updated_at = timezone('utc', now())
    where id = v_attempt.id
    returning * into v_attempt;

    v_completion := app_private.insert_completion_from_attempt(v_attempt);
    v_response := jsonb_build_object(
      'ok', true,
      'finalized', true,
      'already_terminal', false,
      'attempt', app_private.daily_attempt_public_state(v_attempt),
      'completion', v_completion
    );
  end if;

  if v_key is not null then
    insert into app_private.daily_attempt_idempotency (
      user_id, date_key, mode, op, idempotency_key, response
    ) values (
      v_uid, v_date_key, p_mode, 'finalize', v_key, v_response
    )
    on conflict do nothing;
  end if;

  return v_response;
end;
$$;

comment on function public.finalize_daily_attempt(text, text, boolean, integer, text) is
  'Finalize an active attempt via surrender or explicit loss-at-max. Writes daily_completions from server-held guesses only.';

revoke all on function public.finalize_daily_attempt(text, text, boolean, integer, text)
  from public, anon;
grant execute on function public.finalize_daily_attempt(text, text, boolean, integer, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deprecate fabricated-history completion RPCs (compat-safe JSON errors)
-- ---------------------------------------------------------------------------

create or replace function public.complete_daily_mode(
  p_mode text,
  p_taste text,
  p_guess_ids integer[],
  p_hints_used integer default 0,
  p_hard_mode boolean default false,
  p_surrendered boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  -- Parameters retained for signature compatibility with old clients.
  perform p_mode, p_taste, p_guess_ids, p_hints_used, p_hard_mode, p_surrendered;
  return jsonb_build_object(
    'ok', false,
    'error', 'deprecated_use_attempt_flow',
    'reason', 'deprecated_use_attempt_flow',
    'inserted', false,
    'message', 'Use start_daily_attempt / submit_daily_guess / finalize_daily_attempt'
  );
end;
$$;

create or replace function public.complete_daily_mode_with_reward(
  p_mode text,
  p_taste text,
  p_guess_ids integer[],
  p_hints_used integer default 0,
  p_hard_mode boolean default false,
  p_surrendered boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  perform p_mode, p_taste, p_guess_ids, p_hints_used, p_hard_mode, p_surrendered;
  return jsonb_build_object(
    'ok', false,
    'error', 'deprecated_use_attempt_flow',
    'reason', 'deprecated_use_attempt_flow',
    'inserted', false,
    'point_delta', 0,
    'play_point_delta', 0,
    'points_balance', null,
    'message', 'Use start_daily_attempt / submit_daily_guess / finalize_daily_attempt'
  );
end;
$$;

comment on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) is
  'DEPRECATED. Fabricated guess-history completions are rejected. Use the server attempt flow.';
comment on function public.complete_daily_mode_with_reward(text, text, integer[], integer, boolean, boolean) is
  'DEPRECATED. Fabricated guess-history completions are rejected. Use the server attempt flow.';

revoke all on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean)
  from public, anon;
grant execute on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean)
  to authenticated, service_role;

revoke all on function public.complete_daily_mode_with_reward(text, text, integer[], integer, boolean, boolean)
  from public, anon;
grant execute on function public.complete_daily_mode_with_reward(text, text, integer[], integer, boolean, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bonus name: server-validated guess (no trusted boolean)
-- ---------------------------------------------------------------------------

-- Keep old signature as a compatibility stub (never awards).
create or replace function public.complete_bonus_name_with_reward(
  p_mode text,
  p_taste text,
  p_correct boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer := 0;
begin
  perform p_correct;
  if v_uid is not null then
    select balance into v_balance
    from public.user_point_balances
    where user_id = v_uid;
  end if;
  return jsonb_build_object(
    'ok', true,
    'applied', false,
    'reason', 'deprecated_use_guess_payload',
    'error', 'deprecated_use_guess_payload',
    'point_delta', 0,
    'play_point_delta', 0,
    'points_balance', coalesce(v_balance, 0),
    'message', 'Use complete_bonus_name_with_reward(p_mode, p_taste, p_guessed_character_id, p_guess_label)'
  );
end;
$$;

create or replace function public.complete_bonus_name_with_reward(
  p_mode text,
  p_taste text,
  p_guessed_character_id integer,
  p_guess_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_completion public.daily_completions%rowtype;
  v_meta jsonb;
  v_expected_id integer;
  v_aliases jsonb;
  v_norm text;
  v_alias text;
  v_match boolean := false;
  v_award jsonb;
  v_balance integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;
  if app_private.is_cloud_banned(v_uid) then
    raise exception 'Cloud banned'
      using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('summary', 'character', 'cover', 'heardle') then
    raise exception 'Invalid mode'
      using errcode = '22023';
  end if;
  if p_taste is null or p_taste not in ('action', 'romance', 'both') then
    raise exception 'Invalid taste'
      using errcode = '22023';
  end if;

  perform app_private.ensure_shop_account(v_uid);

  select *
  into v_completion
  from public.daily_completions dc
  where dc.user_id = v_uid
    and dc.date_key = v_date_key
    and dc.mode = p_mode;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'no_completion',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if v_completion.outcome is distinct from 'won' or v_completion.guess_count <> 1 then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'not_first_try_win',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if v_completion.taste is distinct from p_taste then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'taste_mismatch',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  select dp.meta, dp.character_id
  into v_meta, v_expected_id
  from public.daily_puzzles dp
  where dp.date_key = v_date_key
    and dp.mode = p_mode
    and dp.taste = p_taste;

  v_meta := coalesce(v_meta, '{}'::jsonb);

  if v_meta ? 'bonus_character_id'
     and nullif(v_meta ->> 'bonus_character_id', '') is not null then
    v_expected_id := (v_meta ->> 'bonus_character_id')::integer;
  elsif p_mode = 'character' then
    -- character_id already selected above
    null;
  else
    v_expected_id := null;
  end if;

  if v_expected_id is null
     and not (v_meta ? 'bonus_name_aliases')
     and nullif(v_meta ->> 'bonus_name_normalized', '') is null then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'bonus_metadata_unavailable',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  if p_guessed_character_id is not null
     and v_expected_id is not null
     and p_guessed_character_id = v_expected_id then
    v_match := true;
  end if;

  if not v_match then
    v_norm := app_private.normalize_bonus_guess_label(p_guess_label);
    if v_norm is not null then
      if v_norm = app_private.normalize_bonus_guess_label(v_meta ->> 'bonus_name_normalized') then
        v_match := true;
      elsif v_meta ? 'bonus_name_aliases'
            and jsonb_typeof(v_meta -> 'bonus_name_aliases') = 'array' then
        for v_alias in
          select value #>> '{}'
          from jsonb_array_elements(v_meta -> 'bonus_name_aliases')
        loop
          if v_norm = app_private.normalize_bonus_guess_label(v_alias) then
            v_match := true;
            exit;
          end if;
        end loop;
      end if;
    end if;
  end if;

  if not v_match then
    return jsonb_build_object(
      'ok', true,
      'applied', false,
      'reason', 'incorrect',
      'point_delta', 0,
      'play_point_delta', 0,
      'points_balance', (
        select balance from public.user_point_balances where user_id = v_uid
      )
    );
  end if;

  v_award := app_private.award_bonus_name_points(v_uid, v_date_key, p_mode);

  select balance into v_balance
  from public.user_point_balances
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'applied', coalesce((v_award ->> 'applied')::boolean, false),
    'date_key', v_date_key,
    'mode', p_mode,
    'taste', p_taste,
    'point_delta', coalesce((v_award ->> 'delta')::integer, 0),
    'play_point_delta', coalesce((v_award ->> 'play_point_delta')::integer, 0),
    'points_balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function public.complete_bonus_name_with_reward(text, text, boolean)
  from public, anon;
grant execute on function public.complete_bonus_name_with_reward(text, text, boolean)
  to authenticated, service_role;

revoke all on function public.complete_bonus_name_with_reward(text, text, integer, text)
  from public, anon;
grant execute on function public.complete_bonus_name_with_reward(text, text, integer, text)
  to authenticated, service_role;

comment on function public.complete_bonus_name_with_reward(text, text, boolean) is
  'DEPRECATED. Trusted p_correct is ignored; always returns applied:false with reason deprecated_use_guess_payload.';
comment on function public.complete_bonus_name_with_reward(text, text, integer, text) is
  'Awards bonus-name XP after a first-try win when the guessed character id or label matches server-held puzzle meta.';

-- ---------------------------------------------------------------------------
-- Rewarded ads: secure default — no DB award without provider verification
-- ---------------------------------------------------------------------------

create or replace function public.claim_rewarded_ad_points(
  p_date_key text,
  p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer := 0;
begin
  -- Retained args for signature compatibility; never awards.
  perform p_date_key, p_points;
  if v_uid is not null then
    select balance into v_balance
    from public.user_point_balances
    where user_id = v_uid;
  end if;
  return jsonb_build_object(
    'ok', false,
    'error', 'provider_verification_required',
    'claimed', false,
    'applied', false,
    'point_delta', 0,
    'points_balance', coalesce(v_balance, 0),
    'message', 'Rewarded-ad points require a server-verified provider receipt'
  );
end;
$$;

comment on function public.claim_rewarded_ad_points(text, integer) is
  'Disabled until provider server-to-server verification exists. Never awards points.';

revoke all on function public.claim_rewarded_ad_points(text, integer) from public, anon;
grant execute on function public.claim_rewarded_ad_points(text, integer)
  to authenticated, service_role;

-- Status remains readable so UI can show "unavailable" / already claimed later.
comment on function public.get_rewarded_ad_claim_status(text) is
  'Returns whether a rewarded-ad claim row exists for the UTC date. Awards themselves are disabled until provider verification.';

-- ---------------------------------------------------------------------------
-- Client-only secrets: cosmetic (no economic points)
-- ---------------------------------------------------------------------------

create or replace function app_private.try_award_secret_cosmetic(
  p_user_id uuid,
  p_achievement_id text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_def public.achievement_definitions%rowtype;
begin
  select * into v_def
  from public.achievement_definitions
  where id = p_achievement_id
    and active
    and category = 'secret';

  if not found then
    return false;
  end if;

  insert into public.user_achievements (
    user_id, achievement_id, achievement_version, awarded_at
  ) values (
    p_user_id, v_def.id, v_def.version, timezone('utc', now())
  )
  on conflict (user_id, achievement_id) do nothing;

  return found;
end;
$$;

revoke all on function app_private.try_award_secret_cosmetic(uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.try_award_secret_cosmetic(uuid, text)
  to postgres, service_role;

-- Preserve hard-mode / no-hint badges, but do not count those client-attested
-- states toward the economic Cascade secret.
create or replace function app_private.award_secrets_from_completion(
  p_user_id uuid,
  p_outcome text,
  p_guess_count integer,
  p_max_guesses integer,
  p_hints_used integer,
  p_hard_mode boolean,
  p_surrendered boolean,
  p_completed_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_hour integer;
  v_new_count integer := 0;
begin
  if p_hard_mode then
    perform app_private.try_award_secret_cosmetic(p_user_id, 'secret_hard_mode');
  end if;

  if p_surrendered then
    if app_private.try_award_secret(p_user_id, 'secret_surrender') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if p_outcome = 'won' and not p_surrendered then
    if coalesce(p_hints_used, 0) = 0 then
      perform app_private.try_award_secret_cosmetic(p_user_id, 'secret_hint_denied');
    end if;
    if p_guess_count = 1 then
      if app_private.try_award_secret(p_user_id, 'secret_perfect') then
        v_new_count := v_new_count + 1;
      end if;
    end if;
    if p_guess_count = p_max_guesses then
      if app_private.try_award_secret(p_user_id, 'secret_slow_burn') then
        v_new_count := v_new_count + 1;
      end if;
    end if;
  end if;

  v_hour := extract(hour from timezone('utc', p_completed_at))::integer;
  if v_hour = 23 then
    if app_private.try_award_secret(p_user_id, 'secret_last_second') then
      v_new_count := v_new_count + 1;
    end if;
  end if;

  if v_new_count >= 2 then
    perform app_private.try_award_secret(p_user_id, 'secret_cascade');
  end if;

  return v_new_count;
end;
$$;

revoke all on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.award_secrets_from_completion(
  uuid, text, integer, integer, integer, boolean, boolean, timestamptz
) to postgres, service_role;

-- Zero economic rewards for client-attested secret definitions, including
-- hard-mode and hint-derived badges until those inputs are server-observable.
update public.achievement_definitions
set point_reward = 0
where id in (
  'secret_konami',
  'secret_background',
  'secret_authors_note',
  'secret_shopaholic',
  'secret_tourist',
  'secret_hard_mode',
  'secret_night_owl',
  'secret_lurker',
  'secret_reauth',
  'secret_idle',
  'secret_refresh',
  'secret_dark',
  'secret_lights',
  'secret_share',
  'secret_wrong_genre',
  'secret_speedrun',
  'secret_tab_twin',
  'secret_escapist',
  'secret_account_menu',
  'secret_four_roads',
  'secret_hint_denied'
);

-- Replace report_secret_event to use cosmetic awards (no points).
-- hard_mode_on no longer unlocks here; completion path may still grant the badge.
create or replace function public.report_secret_event(
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app_private', 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_event text := lower(trim(coalesce(p_event, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_awarded text[] := '{}'::text[];
  v_count integer;
  v_mode text;
  v_key text;
  v_hour integer;
  v_existing integer;
  v_oneshot text;
  v_elapsed integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;

  if v_event = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;

  if v_event = 'multi_unlock' then
    return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end if;

  if not app_private.consume_rpc_rate_limit(v_uid, 'report_secret_event', 40, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_oneshot := case v_event
    when 'konami' then 'secret_konami'
    when 'tab_open_24h' then 'secret_background'
    when 'legal_visit' then 'secret_authors_note'
    when 'shop_visit' then 'secret_shopaholic'
    when 'night_owl' then 'secret_night_owl'
    when 'leaderboard_view' then 'secret_lurker'
    when 'reauth' then 'secret_reauth'
    when 'idle_home' then 'secret_idle'
    when 'dark_theme' then 'secret_dark'
    when 'light_theme' then 'secret_lights'
    when 'share_result' then 'secret_share'
    when 'wrong_genre' then 'secret_wrong_genre'
    when 'speedrun' then 'secret_speedrun'
    when 'tab_twin' then 'secret_tab_twin'
    when 'escape_modal' then 'secret_escapist'
    when 'account_menu_open' then 'secret_account_menu'
    else null
  end;

  if v_oneshot is not null
     and exists (
       select 1
       from public.user_achievements ua
       where ua.user_id = v_uid
         and ua.achievement_id = v_oneshot
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
  end if;

  if v_event = 'home_refresh'
     and exists (
       select 1 from public.user_achievements ua
       where ua.user_id = v_uid and ua.achievement_id = 'secret_refresh'
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
  end if;

  if v_event = 'mode_open'
     and exists (
       select 1 from public.user_achievements ua
       where ua.user_id = v_uid and ua.achievement_id = 'secret_four_roads'
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
  end if;

  if v_event = 'milestones_tourist'
     and exists (
       select 1 from public.user_achievements ua
       where ua.user_id = v_uid and ua.achievement_id = 'secret_tourist'
     ) then
    return jsonb_build_object(
      'ok', true,
      'event', v_event,
      'awarded', '[]'::jsonb
    );
  end if;

  case v_event
    when 'konami' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_konami') then
        v_awarded := array_append(v_awarded, 'secret_konami');
      end if;

    when 'tab_open_24h' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_background') then
        v_awarded := array_append(v_awarded, 'secret_background');
      end if;

    when 'legal_visit' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_authors_note') then
        v_awarded := array_append(v_awarded, 'secret_authors_note');
      end if;

    when 'shop_visit' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_shopaholic') then
        v_awarded := array_append(v_awarded, 'secret_shopaholic');
      end if;

    when 'milestones_tourist' then
      select count(*)::integer into v_existing
      from public.user_achievements ua
      join public.achievement_definitions d on d.id = ua.achievement_id
      where ua.user_id = v_uid
        and d.category in ('completions', 'streak', 'all_mode');
      if v_existing = 0 then
        if app_private.try_award_secret_cosmetic(v_uid, 'secret_tourist') then
          v_awarded := array_append(v_awarded, 'secret_tourist');
        end if;
      end if;

    when 'hard_mode_on' then
      -- Cosmetic/economic unlock for hard mode is server-gated via completions.
      null;

    when 'night_owl' then
      v_hour := coalesce((v_payload ->> 'local_hour')::integer, -1);
      if v_hour >= 0 and v_hour < 5 then
        if app_private.try_award_secret_cosmetic(v_uid, 'secret_night_owl') then
          v_awarded := array_append(v_awarded, 'secret_night_owl');
        end if;
      end if;

    when 'leaderboard_view' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_lurker') then
        v_awarded := array_append(v_awarded, 'secret_lurker');
      end if;

    when 'reauth' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_reauth') then
        v_awarded := array_append(v_awarded, 'secret_reauth');
      end if;

    when 'idle_home' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_idle') then
        v_awarded := array_append(v_awarded, 'secret_idle');
      end if;

    when 'home_refresh' then
      v_key := 'home_refresh:' || public.current_utc_date_key();
      select usc.value into v_count
      from public.user_secret_counters usc
      where usc.user_id = v_uid
        and usc.counter_key = v_key;
      if coalesce(v_count, 0) < 5 then
        v_count := app_private.bump_secret_counter(v_uid, v_key, 1);
      end if;
      if coalesce(v_count, 0) >= 5 then
        if app_private.try_award_secret_cosmetic(v_uid, 'secret_refresh') then
          v_awarded := array_append(v_awarded, 'secret_refresh');
        end if;
      end if;

    when 'dark_theme' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_dark') then
        v_awarded := array_append(v_awarded, 'secret_dark');
      end if;

    when 'light_theme' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_lights') then
        v_awarded := array_append(v_awarded, 'secret_lights');
      end if;

    when 'share_result' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_share') then
        v_awarded := array_append(v_awarded, 'secret_share');
      end if;

    when 'wrong_genre' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_wrong_genre') then
        v_awarded := array_append(v_awarded, 'secret_wrong_genre');
      end if;

    when 'speedrun' then
      v_elapsed := coalesce((v_payload ->> 'elapsed_ms')::integer, 999999);
      if v_elapsed >= 0
         and v_elapsed <= 60000
         and exists (
           select 1
           from public.daily_completions dc
           where dc.user_id = v_uid
             and dc.outcome = 'won'
             and dc.surrendered is not true
             and dc.completed_at > timezone('utc', now()) - interval '2 minutes'
         ) then
        if app_private.try_award_secret_cosmetic(v_uid, 'secret_speedrun') then
          v_awarded := array_append(v_awarded, 'secret_speedrun');
        end if;
      end if;

    when 'tab_twin' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_tab_twin') then
        v_awarded := array_append(v_awarded, 'secret_tab_twin');
      end if;

    when 'escape_modal' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_escapist') then
        v_awarded := array_append(v_awarded, 'secret_escapist');
      end if;

    when 'account_menu_open' then
      if app_private.try_award_secret_cosmetic(v_uid, 'secret_account_menu') then
        v_awarded := array_append(v_awarded, 'secret_account_menu');
      end if;

    when 'mode_open' then
      v_mode := lower(trim(coalesce(v_payload ->> 'mode', '')));
      if v_mode in ('summary', 'character', 'cover', 'heardle') then
        v_key := 'mode_open:' || public.current_utc_date_key() || ':' || v_mode;
        insert into public.user_secret_counters (user_id, counter_key, value, updated_at)
        values (v_uid, v_key, 1, timezone('utc', now()))
        on conflict (user_id, counter_key) do nothing;
        if found then
          v_count := app_private.bump_secret_counter(
            v_uid,
            'mode_open_distinct:' || public.current_utc_date_key(),
            1
          );
          if v_count >= 4 then
            if app_private.try_award_secret_cosmetic(v_uid, 'secret_four_roads') then
              v_awarded := array_append(v_awarded, 'secret_four_roads');
            end if;
          end if;
        end if;
      end if;

    else
      return jsonb_build_object('ok', false, 'error', 'unknown_event');
  end case;

  -- Do not award Cascade here: economic Cascade is granted only from
  -- app_private.award_achievements on verified completion / visit paths.

  return jsonb_build_object(
    'ok', true,
    'event', v_event,
    'awarded', to_jsonb(v_awarded)
  );
end;
$$;

comment on function public.report_secret_event(text, jsonb) is
  'Client secret events unlock cosmetic badges only (no economic points). Rate-limited.';

revoke all on function public.report_secret_event(text, jsonb) from public, anon;
grant execute on function public.report_secret_event(text, jsonb)
  to authenticated, service_role;

-- hard_mode / hints_used are still supplied by the browser in this contract.
-- Their badges may be awarded, but remain non-economic until independently
-- server-verifiable.
