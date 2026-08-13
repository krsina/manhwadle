-- Ember Crown Style A whole-character shop addition.
-- Additive only: does NOT deactivate existing avatars or re-run whitelist cuts.

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  ('avatar_ember_crown', 'avatar', null, 'Ember Crown',
   'Fiery orange ponytail, gold-collar cape, and a held fireball.',
   7000, 'epic', 'avatar_ember_crown', 170, true)
on conflict (id) do update set
  item_type = excluded.item_type,
  slot = excluded.slot,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  rarity = excluded.rarity,
  asset_key = excluded.asset_key,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = timezone('utc', now());

-- Keep awakenings inactive to match 20260720010000_disable_avatar_awakenings.
insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active,
   parent_item_id, awakening_tier)
values
  ('awaken_avatar_ember_crown_1', 'avatar_awakening', null, 'Awakening',
   'Unlock a frame-by-frame idle that flows into a cool action for Ember Crown.',
   100, 'rare', 'awaken_avatar_ember_crown_1', 9170, false,
   'avatar_ember_crown', 1)
on conflict (id) do update set
  item_type = excluded.item_type,
  slot = excluded.slot,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  rarity = excluded.rarity,
  asset_key = excluded.asset_key,
  sort_order = excluded.sort_order,
  active = excluded.active,
  parent_item_id = excluded.parent_item_id,
  awakening_tier = excluded.awakening_tier,
  updated_at = timezone('utc', now());
