-- Shared daily puzzle pools + deterministic lane selection (FNV + daily_index).
-- Recovers remote migration ensure_daily_puzzles_fn for fresh databases.

create table if not exists public.puzzle_pool_entries (
  mode text not null
    check (mode = any (array['summary'::text, 'character'::text, 'cover'::text])),
  taste text not null
    check (taste = any (array['action'::text, 'romance'::text, 'both'::text])),
  position integer not null check (position >= 0),
  manhwa_id integer not null,
  character_id integer,
  meta jsonb,
  primary key (mode, taste, position)
);

create table if not exists public.daily_puzzles (
  date_key text not null,
  mode text not null
    check (mode = any (array['summary'::text, 'character'::text, 'cover'::text])),
  taste text not null
    check (taste = any (array['action'::text, 'romance'::text, 'both'::text])),
  answer_id integer not null,
  character_id integer,
  meta jsonb,
  created_at timestamptz not null default now(),
  primary key (date_key, mode, taste)
);

-- FNV-1a 32-bit, matching src/lib/daily.ts hashString
create or replace function public.hash_string(input text)
returns bigint
language plpgsql
immutable
parallel safe
as $$
declare
  h bigint := 2166136261;
  i int;
  c int;
begin
  for i in 1..char_length(input) loop
    c := ascii(substr(input, i, 1));
    h := (h # c) & 4294967295;
    h := (h * 16777619) & 4294967295;
  end loop;
  return h;
end;
$$;

create or replace function public.daily_index(
  date_key text,
  pool_size integer,
  seed_prefix text
)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    when pool_size <= 0 then 0
    else (public.hash_string(seed_prefix || '-' || date_key) % pool_size)::int
  end;
$$;

create or replace function public.current_utc_date_key()
returns text
language sql
stable
as $$
  select to_char((timezone('utc', now()))::date, 'YYYY-MM-DD');
$$;

-- Initial ensure: 3 modes × 3 tastes; character_id taken from pool row only.
create or replace function public.ensure_daily_puzzles(p_date_key text default null)
returns integer
language plpgsql
security definer
as $$
declare
  dkey text := coalesce(p_date_key, public.current_utc_date_key());
  lane record;
  pool_size int;
  idx int;
  answer int;
  char_id int;
  seed text;
  inserted int := 0;
begin
  for lane in
    select m.mode, t.taste
    from (values ('summary'), ('character'), ('cover')) as m(mode)
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

    select p.manhwa_id, p.character_id
    into answer, char_id
    from public.puzzle_pool_entries p
    where p.mode = lane.mode and p.taste = lane.taste and p.position = idx;

    insert into public.daily_puzzles (date_key, mode, taste, answer_id, character_id)
    values (dkey, lane.mode, lane.taste, answer, char_id)
    on conflict do nothing;

    inserted := inserted + 1;
  end loop;

  return inserted;
end;
$$;
