# Account data export & deletion

Edge Function: `supabase/functions/account-data`

## What it does

- **GET** — exports the signed-in user’s profile, settings, player stats, day progress, daily completions, wallet, point ledger, avatar entitlements, and avatar profile as JSON.
- **DELETE** — permanently deletes the Auth user (and cascaded app rows). Body must be `{ "confirm": "DELETE" }`.

## Security

- Verifies the `Authorization: Bearer <user JWT>` with `auth.getUser(jwt)`.
- Derives the user id **only** from that JWT. Rejects body fields `user_id` / `userId` / `actor_id` / `actorId` on DELETE.
- CORS is an origin allowlist via `CORS_ALLOWED_ORIGINS` (local Vite defaults when unset) — see [deployment.md](./deployment.md).
- Uses the service role only after JWT verification, for admin delete + full export reads.

## Deploy

```bash
supabase functions deploy account-data
```

Hosted projects inject `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep `verify_jwt = true` in `supabase/config.toml`. Set `CORS_ALLOWED_ORIGINS` on hosted projects (never commit the value).

Apply migration `20260718040000_identity_settings.sql` before relying on username RPCs / `user_settings` / `public_profiles`. Apply `20260718050000_roles_moderation.sql` for bans/reports (cloud bans block writes; export GET still works for the signed-in user). See `docs/moderation.md`.

Apply these migrations before deploying the export update (in order):

1. `20260718110000_avatar_shop_economy.sql`
2. `20260718120000_layered_avatar_loadouts.sql`
3. `20260718130000_style_c_expanded_avatar_slots.sql` — historical Style C 11-slot expansion (`body` / `ears` / `headwear` columns + catalog). Retained for provenance; superseded by the whole-character cutover below.
4. `20260718140000_whole_character_avatar_shop.sql` — **current product**: Style A whole-character catalog (`avatar_default_female`, `avatar_default_male`, `avatar_shadow_hunter`, `avatar_skybreaker_monk`), `equipped_avatar_id` equip/purchase RPCs, deactivates layered `avatar_part` rows and legacy gen-1 avatars outside that catalog. Loadout columns on `user_avatar_profiles` are retained but unused by public shop RPCs.
5. `20260718190000_play_xp_leveling.sql` — initial play XP + bonus-name awards.
6. `20260718240000_rebalance_play_xp.sql` — rebalanced ~2-year curve, all-modes bonus, daily play-XP cap (see [play-xp-leveling.md](./play-xp-leveling.md)).
7. `20260719100000_avatar_wave1_shop.sql` / `20260719110000_avatar_stage_shop.sql` — wave-1 characters + stage backgrounds.
8. `20260719213957_avatar_awakenings.sql` — Awakening I/II upgrades (`user_avatar_awakenings`, `avatar_awakening` shop items, `equipped_awakening_level`). See [avatar-awakening-style-guide.md](./avatar-awakening-style-guide.md).

## Play XP & leveling

See **[play-xp-leveling.md](./play-xp-leveling.md)** for the full award table, level timeline, and daily anticheat cap.

Lifetime shop points earned (`user_point_balances.lifetime_earned`) are the player’s XP. Level 1–99 is derived from that total; spending does not reduce level.

Summary: win **100** per mode (same for all modes), first-try **+3**, golden solve **+3**, all-modes day **+16**, streak mult up to **1.5×**, losses **0**. Consistent all-mode streaked play reaches level 99 in about **748 days (~2 years)**.

Achievement point rewards still increment `lifetime_earned` (not limited by the daily play-XP cap).

The Edge Function reads private shop data through the service-role-only `export_shop_account` RPC after verifying the caller JWT. That RPC returns:

- `wallet` — point balance / lifetime totals
- `entitlements` — owned shop items (including whole-character avatars and awakenings)
- `avatar_awakenings` — per-avatar awakening tiers (`level` 1 or 2)
- `avatar_profile` — raw profile row. Live product equips via `equipped_avatar_id` (whole characters). The row may still contain optional historical loadout columns (`body_id`, `skin_id`, `face_id`, etc.) from the layered experiment; those are not used by the current shop UI or client parsers.
- `point_transactions` — private ledger rows

Older export payloads may also include a structured `avatar_loadout` object (or `null`). That field is historical; after `20260718140000`, `export_shop_account` no longer builds an 11-key loadout. Client account parsers (`parseAccountSnapshot` / shop helpers) read **`equipped_avatar_id`** for the live whole-character product — they do not treat `normalizeAvatarLoadout` / 11-key loadouts as current product behavior.

## Client

Settings → Export account data / Delete account (signed-in). The Vite app calls:

`POST/GET/DELETE ${VITE_SUPABASE_URL}/functions/v1/account-data`
