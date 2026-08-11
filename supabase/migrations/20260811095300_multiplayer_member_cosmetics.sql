-- Expose equipped stage (profile banner) on Versus roster members.
-- Do not reference equipped_awakening_level — awakenings are scrapped / not on profiles.

do $fix$
declare
  def text;
begin
  select pg_get_functiondef('app_private.multiplayer_state(uuid, uuid)'::regprocedure)
  into def;
  if def is null then
    raise notice 'app_private.multiplayer_state missing; skip roster cosmetics';
    return;
  end if;

  -- Strip any awakening references introduced by earlier drafts.
  if position($s$equipped_awakening_level$s$ in def) > 0
     or position($s$'awakening_level', ranked.awakening_level$s$ in def) > 0 then
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
  end if;

  if position($s$'stage_id', ranked.stage_id$s$ in def) = 0 then
    if position($s$'avatar_id', ranked.avatar_id,$s$ in def) = 0 then
      raise exception 'unexpected multiplayer_state definition; cannot patch roster cosmetics';
    end if;

    def := replace(
      def,
      $s$'avatar_id', ranked.avatar_id,
    'is_host', ranked.user_id = v_room.host_user_id,$s$,
      $s$'avatar_id', ranked.avatar_id,
    'stage_id', ranked.stage_id,
    'is_host', ranked.user_id = v_room.host_user_id,$s$
    );

    def := replace(
      def,
      $s$uap.equipped_item_id as avatar_id,$s$,
      $s$uap.equipped_item_id as avatar_id,
      uap.equipped_stage_id as stage_id,$s$
    );
  end if;

  execute def;
end;
$fix$;
