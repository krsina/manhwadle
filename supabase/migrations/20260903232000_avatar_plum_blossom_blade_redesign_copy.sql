-- Refresh Plum Blossom Blade shop copy to match redesigned Style A plate.
-- Additive only: does NOT deactivate existing avatars or re-run whitelist cuts.

update public.shop_items
set
  description = 'Black murim robes with red trim, pink plum petals, and a long sword.',
  updated_at = timezone('utc', now())
where id = 'avatar_plum_blossom_blade';
