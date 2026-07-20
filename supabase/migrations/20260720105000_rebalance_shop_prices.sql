-- Rebalance avatar/stage shop prices so rares take ~1 week of play.
-- Targets (all-mode daily play + early easy achievements):
--   rare avatar  ~4000  (~7 days)
--   epic avatar  ~7000  (~1.5–2 weeks)
--   rare stage   ~2500  (~4 days)

update public.shop_items
set price = 4000,
    updated_at = timezone('utc', now())
where item_type = 'avatar'
  and rarity = 'rare'
  and active = true
  and price > 0;

update public.shop_items
set price = 7000,
    updated_at = timezone('utc', now())
where item_type = 'avatar'
  and rarity = 'epic'
  and active = true
  and price > 0;

update public.shop_items
set price = 2500,
    updated_at = timezone('utc', now())
where item_type = 'avatar_stage'
  and rarity = 'rare'
  and active = true
  and price > 0;
