-- Server-validated daily completions for community integrity / future leaderboards.
-- This is NOT cheat-proof while daily_puzzles.answer_id remains client-readable;
-- the RPC only proves a consistent terminal guess sequence against today's answer.

create table if not exists public.daily_completions (
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
  outcome text not null
    check (outcome = any (array['won'::text, 'lost'::text])),
  guess_count integer not null check (guess_count >= 0 and guess_count <= 6),
  hints_used integer not null default 0 check (hints_used >= 0 and hints_used <= 6),
  hard_mode boolean not null default false,
  surrendered boolean not null default false,
  -- Verification metadata (server-derived / server-checked)
  answer_id integer not null,
  character_id integer,
  guess_ids integer[] not null,
  max_guesses integer not null default 6 check (max_guesses = 6),
  completed_at timestamptz not null default timezone('utc', now()),
  constraint daily_completions_user_date_mode_key unique (user_id, date_key, mode),
  constraint daily_completions_surrender_semantics check (
    (surrendered = false)
    or (outcome = 'lost' and guess_count < max_guesses)
  ),
  constraint daily_completions_loss_without_surrender check (
    outcome = 'won'
    or surrendered = true
    or guess_count = max_guesses
  ),
  constraint daily_completions_win_has_guess check (
    outcome = 'lost' or guess_count >= 1
  )
);

comment on table public.daily_completions is
  'Immutable server-validated daily mode completions. Community integrity only — not cheat-proof while answer IDs are client-readable via daily_puzzles.';

comment on column public.daily_completions.guess_ids is
  'Ordered guess manhwa IDs submitted at completion; outcome is derived server-side against daily_puzzles.answer_id.';

comment on column public.daily_completions.answer_id is
  'Server answer from daily_puzzles at completion time; never trusted from the client.';

create index if not exists daily_completions_date_mode_idx
  on public.daily_completions (date_key, mode);

create index if not exists daily_completions_user_date_idx
  on public.daily_completions (user_id, date_key);

alter table public.daily_completions enable row level security;

-- Authenticated clients: owner SELECT only. No INSERT/UPDATE/DELETE policies.
drop policy if exists daily_completions_select_own on public.daily_completions;
create policy daily_completions_select_own
  on public.daily_completions
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.daily_completions from public;
revoke all on table public.daily_completions from anon, authenticated;
grant select on table public.daily_completions to authenticated;
grant all on table public.daily_completions to service_role;

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
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_date_key text := public.current_utc_date_key();
  v_max_guesses constant integer := 6;
  v_hints integer := coalesce(p_hints_used, 0);
  v_hard boolean := coalesce(p_hard_mode, false);
  v_surrendered boolean := coalesce(p_surrendered, false);
  v_guess_ids integer[] := coalesce(p_guess_ids, '{}'::integer[]);
  v_guess_count integer;
  v_answer_id integer;
  v_character_id integer;
  v_answer_hits integer;
  v_answer_pos integer;
  v_outcome text;
  v_existing public.daily_completions%rowtype;
  v_inserted boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required'
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

  if v_hints < 0 or v_hints > v_max_guesses then
    raise exception 'Invalid hints_used'
      using errcode = '22023';
  end if;

  v_guess_count := coalesce(cardinality(v_guess_ids), 0);
  if v_guess_count > v_max_guesses then
    raise exception 'Too many guesses'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_guess_ids) as g(id)
    where g.id is null or g.id <= 0
  ) then
    raise exception 'Invalid guess id'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_guess_ids) as g(id)
    group by g.id
    having count(*) > 1
  ) then
    raise exception 'Duplicate guesses are not allowed'
      using errcode = '22023';
  end if;

  -- Ensure today's lane exists (security definer; clients cannot call ensure directly).
  perform public.ensure_daily_puzzles(v_date_key);

  select dp.answer_id, dp.character_id
  into v_answer_id, v_character_id
  from public.daily_puzzles dp
  where dp.date_key = v_date_key
    and dp.mode = p_mode
    and dp.taste = p_taste;

  if v_answer_id is null then
    raise exception 'Daily puzzle unavailable for mode/taste'
      using errcode = 'P0002';
  end if;

  select count(*), min(ord)
  into v_answer_hits, v_answer_pos
  from unnest(v_guess_ids) with ordinality as g(id, ord)
  where g.id = v_answer_id;

  v_answer_hits := coalesce(v_answer_hits, 0);

  if v_answer_hits > 0 then
    if v_surrendered then
      raise exception 'Cannot surrender after a correct guess'
        using errcode = '22023';
    end if;
    if v_answer_hits <> 1 or v_answer_pos <> v_guess_count then
      raise exception 'Correct answer must be the final guess'
        using errcode = '22023';
    end if;
    v_outcome := 'won';
  else
    if v_surrendered then
      if v_guess_count >= v_max_guesses then
        raise exception 'Surrender requires fewer than max guesses'
          using errcode = '22023';
      end if;
      v_outcome := 'lost';
    else
      if v_guess_count <> v_max_guesses then
        raise exception 'Loss requires max guesses or surrender'
          using errcode = '22023';
      end if;
      v_outcome := 'lost';
    end if;
  end if;

  -- Idempotent: one row per account/date/mode (taste of first write wins).
  select *
  into v_existing
  from public.daily_completions dc
  where dc.user_id = v_uid
    and dc.date_key = v_date_key
    and dc.mode = p_mode;

  if found then
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
      'completed_at', v_existing.completed_at
    );
  end if;

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
      v_uid,
      v_date_key,
      p_mode,
      p_taste,
      v_outcome,
      v_guess_count,
      v_hints,
      v_hard,
      v_surrendered,
      v_answer_id,
      v_character_id,
      v_guess_ids,
      v_max_guesses
    )
    returning * into v_existing;
    v_inserted := true;
  exception
    when unique_violation then
      select *
      into v_existing
      from public.daily_completions dc
      where dc.user_id = v_uid
        and dc.date_key = v_date_key
        and dc.mode = p_mode;
      v_inserted := false;
  end;

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
    'completed_at', v_existing.completed_at
  );
end;
$$;

comment on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) is
  'SECURITY DEFINER RPC: records an immutable daily completion for auth.uid() on the server UTC date. Validates guess sequence against daily_puzzles. Community integrity only — not cheat-proof while answer IDs are client-readable.';

revoke all on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) from public;
revoke all on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) from anon;
grant execute on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) to authenticated;
grant execute on function public.complete_daily_mode(text, text, integer[], integer, boolean, boolean) to service_role;
