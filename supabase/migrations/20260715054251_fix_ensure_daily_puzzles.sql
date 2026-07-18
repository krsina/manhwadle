-- Pick character answers from meta.eligible_character_ids (deterministic FNV),
-- matching client-side character seeding. Recovers remote fix_ensure_daily_puzzles.

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
