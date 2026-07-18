-- Lock down daily-puzzle helpers: fixed search_path, tight EXECUTE grants, RLS.
-- Recovers remote harden_function_grants_search_path.

create or replace function public.hash_string(input text)
returns bigint
language plpgsql
immutable
parallel safe
set search_path to 'public'
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
set search_path to 'public'
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
set search_path to 'public'
as $$
  select to_char((timezone('utc', now()))::date, 'YYYY-MM-DD');
$$;

create or replace function public.ensure_daily_puzzles(p_date_key text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
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
  char_ids int[];
  char_idx int;
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

    select p.manhwa_id, p.character_id, p.meta
    into answer, char_id, entry_meta
    from public.puzzle_pool_entries p
    where p.mode = lane.mode and p.taste = lane.taste and p.position = idx;

    if lane.mode = 'character'
       and entry_meta is not null
       and entry_meta ? 'eligible_character_ids'
       and jsonb_typeof(entry_meta->'eligible_character_ids') = 'array'
       and jsonb_array_length(entry_meta->'eligible_character_ids') > 0
    then
      select array_agg((elem #>> '{}')::int order by ord)
      into char_ids
      from jsonb_array_elements(entry_meta->'eligible_character_ids') with ordinality as t(elem, ord);

      if char_ids is not null and array_length(char_ids, 1) > 0 then
        char_idx := (public.hash_string(seed || '-char-' || dkey || '-' || answer::text)
                     % array_length(char_ids, 1))::int;
        char_id := char_ids[char_idx + 1];
      end if;
    end if;

    insert into public.daily_puzzles (date_key, mode, taste, answer_id, character_id)
    values (dkey, lane.mode, lane.taste, answer, char_id)
    on conflict do nothing;

    inserted := inserted + 1;
  end loop;

  return inserted;
end;
$$;

-- Clients may call pure helpers; only service_role/postgres may mint dailies.
revoke all on function public.hash_string(text) from public;
revoke all on function public.daily_index(text, integer, text) from public;
revoke all on function public.current_utc_date_key() from public;
revoke all on function public.ensure_daily_puzzles(text) from public;

grant execute on function public.hash_string(text) to anon, authenticated, service_role;
grant execute on function public.daily_index(text, integer, text) to anon, authenticated, service_role;
grant execute on function public.current_utc_date_key() to anon, authenticated, service_role;
grant execute on function public.ensure_daily_puzzles(text) to service_role;

alter table public.puzzle_pool_entries enable row level security;
alter table public.daily_puzzles enable row level security;

drop policy if exists puzzle_pool_entries_select_all on public.puzzle_pool_entries;
create policy puzzle_pool_entries_select_all
  on public.puzzle_pool_entries
  for select
  to anon, authenticated
  using (true);

drop policy if exists daily_puzzles_select_past_and_today on public.daily_puzzles;
create policy daily_puzzles_select_past_and_today
  on public.daily_puzzles
  for select
  to anon, authenticated
  using (date_key <= public.current_utc_date_key());

revoke all on table public.puzzle_pool_entries from anon, authenticated;
revoke all on table public.daily_puzzles from anon, authenticated;
grant select on table public.puzzle_pool_entries to anon, authenticated;
grant select on table public.daily_puzzles to anon, authenticated;
