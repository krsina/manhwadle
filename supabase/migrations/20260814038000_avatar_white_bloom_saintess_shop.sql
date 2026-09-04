-- White Bloom Saintess Style A whole-character shop addition.
-- Additive only: does NOT deactivate existing avatars or re-run whitelist cuts.

insert into public.shop_items
  (id, item_type, slot, name, description, price, rarity, asset_key, sort_order, active)
values
  ('avatar_white_bloom_saintess', 'avatar', null, 'White Bloom Saintess',
   'White hair, uncovered crimson eyes, and a gold holy staff.',
   10000, 'legendary', 'avatar_white_bloom_saintess', 250, true)
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
  ('awaken_avatar_white_bloom_saintess_1', 'avatar_awakening', null, 'Awakening',
   'Unlock a frame-by-frame idle that flows into a cool action for White Bloom Saintess.',
   100, 'rare', 'awaken_avatar_white_bloom_saintess_1', 9250, false,
   'avatar_white_bloom_saintess', 1)
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
