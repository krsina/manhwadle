-- Retire avatar awakenings from the live product.
-- Historical tables and inactive catalog rows stay for FK / export provenance.
-- The client no longer sells or plays awakening sheets.

update public.shop_items
set
  active = false,
  updated_at = timezone('utc', now())
where item_type = 'avatar_awakening'
  and active = true;
