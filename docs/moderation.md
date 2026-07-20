# Moderation, roles, bans, and Auth hooks

## Authorization model

| Capability | Moderator | Owner |
|---|---|---|
| Force username change | yes (reason required) | yes |
| Temporary cloud ban | yes (reason + expiry ≤ 30d) | yes |
| Temporary leaderboard exclusion | yes (reason + expiry ≤ 30d) | yes |
| Permanent cloud ban / exclusion | no | yes |
| Grant / revoke roles | no | yes |
| Act on moderators / owners | no | yes (not self) |
| Block identity digests | no | yes |

Roles live in `app_private.user_roles`. **Never authorize from `user_metadata`.** Browser UI role checks are convenience only; every privileged action rechecks live private DB state via the Edge Function → `app_private.*` RPCs.

Cloud-banned accounts may still authenticate and **SELECT** their own synced rows, but RLS + RPCs block writes to settings, sync, progress, completions, and public profile (except forced-rename claim / appeals). Local anonymous play remains available.

## Owner bootstrap (server-side only)

There is **no** browser path to create the first Owner. After applying `20260718050000_roles_moderation.sql`, run as a privileged DB role (SQL editor / `psql` with service credentials), substituting the Auth user UUID:

```sql
insert into app_private.user_roles (user_id, role, granted_by)
values ('00000000-0000-0000-0000-000000000000', 'owner', null)
on conflict (user_id, role) do nothing;
```

Document the UUID and operator in your runbook. Subsequent owner/moderator grants go through the moderation Edge Function (`grant_role`), which requires an existing Owner actor.

## Edge Function: `moderation`

Path: `supabase/functions/moderation`

- **POST** only. Body: `{ "action": "...", ... }`.
- Verifies `Authorization: Bearer <user JWT>` with `auth.getUser(jwt)`.
- Derives **actor** solely from that JWT. Rejects client-supplied `actor_id` / `actorId` / `user_id` / `userId` (targets still use `target_user_id`).
- CORS is an origin allowlist via `CORS_ALLOWED_ORIGINS` (local Vite defaults when unset) — see [deployment.md](./deployment.md).
- Uses the service role only after JWT verification to call `app_private` RPCs.
- Does **not** expose the service role to the browser.

```bash
supabase functions deploy moderation
```

Keep `verify_jwt = true` (see `supabase/config.toml`).

### Example actions

```json
{ "action": "lookup_username", "username": "ExactName" }
{ "action": "force_username_change", "target_user_id": "<uuid>", "reason": "impersonation" }
{ "action": "issue_cloud_ban", "target_user_id": "<uuid>", "reason": "abuse", "ends_at": "2026-08-01T00:00:00Z" }
{ "action": "issue_cloud_ban", "target_user_id": "<uuid>", "reason": "severe abuse", "permanent": true }
{ "action": "grant_role", "target_user_id": "<uuid>", "role": "moderator", "reason": "trusted volunteer" }
{ "action": "get_site_status" }
{ "action": "set_site_status", "banner_message": "Heardle audio delayed", "banner_severity": "warning" }
{ "action": "set_mode_status", "mode": "heardle", "available": false, "message": "Clip hosting issue" }
{ "action": "set_outage_exemption", "date_key": "2026-07-18", "mode": "heardle", "reason": "outage" }
```

Owner-only Status tab in the moderation UI covers banners, per-mode availability, and required-mode outage exemptions. Server RPCs reject non-owners.

## Before User Created hook

Migration defines `public.hook_before_user_created(event jsonb)`, which HMAC-checks email / provider subjects against `app_private.blocked_identities` (digests only; no plaintext retention). Enable in Dashboard → Authentication → Hooks → Before User Created, or locally in `config.toml` when supported.

Limitations: OAuth may not always supply a matching email/subject at hook time; person-level ban evasion via new identities cannot be guaranteed. No device fingerprinting; do not retain raw IPs from hook metadata.

## CAPTCHA, leaked passwords, and Auth rate limits

Configure in the Supabase Dashboard (do not commit secrets). Full rollout checklist: [deployment.md §6](./deployment.md#6-hosted-auth--edge-function-settings-dashboard--secrets).

1. **Authentication → Rate Limits** — tighten email OTP / signup / recovery limits for production.
2. **Authentication → Attack Protection / CAPTCHA** — enable CAPTCHA (e.g. hCaptcha or Turnstile) for signup and sensitive auth flows. Add the site/secret keys as project secrets; wire the client captcha token into `signInWithOtp` / OAuth options per current Supabase Auth docs.
3. **Leaked-password protection** — enable HaveIBeenPwned / leaked-password checks for email passwords.
4. Prefer Auth rate limits + CAPTCHA over IP storage. This project intentionally does not persist request IPs for moderation.

## Staging security negatives

Against a **staging or local** Supabase project only:

```bash
npm run test:live:security
```

Requires `SECURITY_SMOKE_TARGET`, `SECURITY_SMOKE_ACK_NON_PRODUCTION=I_UNDERSTAND_STAGING_ONLY`, and `STAGING_SUPABASE_*` credentials. The script refuse-closes on production project refs and does not use `VITE_*` keys. Full env matrix and coverage: [runbooks/security-negatives-staging.md](./runbooks/security-negatives-staging.md). Do not enable CI against production.

## Related migrations

- `20260718040000_identity_settings.sql` — usernames / settings
- `20260718050000_roles_moderation.sql` — roles, restrictions, audit, reports, appeals, ban RLS
- `20260718060000_leaderboard_home_status.sql` — Top Rankings, streaks, achievements, site/mode status
- `20260718070000_leaderboard_always_on.sql` — signed-in play always counts on Top Rankings (no opt-in)
- `20260720212000_leaderboard_read_rate_limits.sql` — signed-in `get_leaderboard` / `get_my_leaderboard_standing` rate limits (60/min; live reads, no cache)
