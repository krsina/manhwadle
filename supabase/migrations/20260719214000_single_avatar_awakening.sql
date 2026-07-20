/**
 * Collapse Awakenings I/II into a single Awakening per premium avatar.
 * - Deactivate tier-2 shop rows
 * - Rename tier-1 to "Awakening"
 * - Clamp user awakening level 2 → 1
 *
 * Must run after 20260719213957_avatar_awakenings (creates the table).
 * Replaces mis-ordered 20260719140000 which referenced the table before it existed.
 */

-- Clamp stored levels (column is `level`, not awakening_level).
do $$
begin
  if to_regclass('public.user_avatar_awakenings') is not null then
    update public.user_avatar_awakenings
    set level = 1
    where level > 1;
  end if;
end
$$;

-- Deactivate Awakening II catalog rows (keep rows for history / FK safety).
update public.shop_items
set active = false
where item_type = 'avatar_awakening'
  and awakening_tier = 2;

-- Single product copy on remaining Awakening rows.
update public.shop_items
set
  name = 'Awakening',
  description = replace(
    coalesce(description, ''),
    'Awakening I',
    'Awakening'
  ),
  rarity = 'rare'
where item_type = 'avatar_awakening'
  and awakening_tier = 1
  and active;

update public.shop_items
set description = 'Unlock a frame-by-frame idle that flows into a cool action for this character.'
where item_type = 'avatar_awakening'
  and awakening_tier = 1
  and active
  and (
    description is null
    or description = ''
    or description ilike '%Awakening I%'
    or description ilike '%subtle%'
  );
