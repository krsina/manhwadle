-- Starter avatar copy: short description + common rarity label.

update public.shop_items
set description = 'A plain starter look',
    rarity = 'common',
    updated_at = timezone('utc', now())
where id in ('avatar_default_female', 'avatar_default_male');
