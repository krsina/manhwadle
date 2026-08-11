-- Repair Versus roster cosmetics: drop scrapped awakening_level references if present.

do $fix$
declare
  def text;
begin
  select pg_get_functiondef('app_private.multiplayer_state(uuid, uuid)'::regprocedure)
  into def;
  if def is null then
    raise notice 'app_private.multiplayer_state missing; skip awakening cleanup';
    return;
  end if;

  if position($s$equipped_awakening_level$s$ in def) = 0
     and position($s$'awakening_level', ranked.awakening_level$s$ in def) = 0 then
    raise notice 'multiplayer_state has no awakening references';
    return;
  end if;

  def := replace(
    def,
    $s$'avatar_id', ranked.avatar_id,
    'stage_id', ranked.stage_id,
    'awakening_level', ranked.awakening_level,
    'is_host', ranked.user_id = v_room.host_user_id,$s$,
    $s$'avatar_id', ranked.avatar_id,
    'stage_id', ranked.stage_id,
    'is_host', ranked.user_id = v_room.host_user_id,$s$
  );
  def := replace(
    def,
    $s$uap.equipped_item_id as avatar_id,
      uap.equipped_stage_id as stage_id,
      coalesce(uap.equipped_awakening_level, 0)::integer as awakening_level,$s$,
    $s$uap.equipped_item_id as avatar_id,
      uap.equipped_stage_id as stage_id,$s$
  );
  execute def;
end;
$fix$;
