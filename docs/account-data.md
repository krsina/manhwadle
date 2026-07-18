# Account data export & deletion

Edge Function: `supabase/functions/account-data`

## What it does

- **GET** — exports the signed-in user’s profile, settings, player stats, day progress, and daily completions as JSON.
- **DELETE** — permanently deletes the Auth user (and cascaded app rows). Body must be `{ "confirm": "DELETE" }`.

## Security

- Verifies the `Authorization: Bearer <user JWT>` with `auth.getUser(jwt)`.
- Derives the user id **only** from that JWT. Never accepts a target user id from the client.
- Uses the service role only after JWT verification, for admin delete + full export reads.

## Deploy

```bash
supabase functions deploy account-data
```

Hosted projects inject `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Leave platform `verify_jwt` enabled (default).

Apply migration `20260718040000_identity_settings.sql` before relying on username RPCs / `user_settings` / `public_profiles`. Apply `20260718050000_roles_moderation.sql` for bans/reports (cloud bans block writes; export GET still works for the signed-in user). See `docs/moderation.md`.

## Client

Settings → Export account data / Delete account (signed-in). The Vite app calls:

`POST/GET/DELETE ${VITE_SUPABASE_URL}/functions/v1/account-data`
