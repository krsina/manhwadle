-- Disable Avatar Awakenings in production until sprite animation quality is ready.
-- Catalog rows kept for history / FK safety; re-enable by setting active = true
-- and flipping AVATAR_AWAKENINGS_ENABLED in src/lib/avatarAwakening.ts.

update public.shop_items
set active = false,
    updated_at = timezone('utc', now())
where item_type = 'avatar_awakening'
  and active = true;
