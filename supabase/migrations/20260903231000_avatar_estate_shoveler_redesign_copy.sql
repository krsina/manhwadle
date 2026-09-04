-- Refresh Estate Shoveler shop copy to match redesigned Style A plate.
-- Additive only: does NOT deactivate existing avatars or re-run whitelist cuts.

update public.shop_items
set
  description = 'Messy brown hair, open brown trench coat, and a shouldered shovel.',
  updated_at = timezone('utc', now())
where id = 'avatar_estate_shoveler';
