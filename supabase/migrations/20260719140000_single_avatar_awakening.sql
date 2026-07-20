/**
 * Collapse Awakenings I/II into a single Awakening per premium avatar.
 * - Deactivate tier-2 shop rows
 * - Rename tier-1 to "Awakening"
 * - Clamp user awakening_level 2 → 1
 */

-- Anyone who somehow only had tier-2 ownership already stores awakening_level on
-- user_avatar_awakenings; clamp highs down to 1.
update public.user_avatar_awakenings
set awakening_level = 1
where awakening_level > 1;

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
