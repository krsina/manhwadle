# Security negatives (staging / local only)

Adversarial smoke that proves RLS, locked tables, attempt/economy RPCs, and Edge Functions **reject** abuse. It creates disposable Auth users, runs negative checks, then deletes them.

**Never run this against production.** The script fail-closes unless an explicit non-production target and acknowledgment are set, and it never reads `VITE_*` / production `.env` keys for credentials.

## Command

```bash
npm run test:live:security
```

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | All checks passed (or skipped missing migrations with no fails) |
| `1` | One or more negative checks failed |
| `2` | Guard blocked the run (missing ack/target/credentials or production URL) |

## Required environment

Set these in the shell or a **staging-only** env file (do not put production service role keys here):

| Variable | Required | Purpose |
| --- | --- | --- |
| `SECURITY_SMOKE_TARGET` | yes | `staging` or `local` only |
| `SECURITY_SMOKE_ACK_NON_PRODUCTION` | yes | Exact value: `I_UNDERSTAND_STAGING_ONLY` |
| `STAGING_SUPABASE_URL` | yes* | Staging or local API URL |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | yes* | Service role for that project only |
| `STAGING_SUPABASE_ANON_KEY` | yes* | Anon/publishable key for that project |
| `SECURITY_SMOKE_PRODUCTION_REF_DENYLIST` | no | Extra comma-separated project refs to refuse |

\*Aliases: `SECURITY_SMOKE_SUPABASE_URL`, `SECURITY_SMOKE_SERVICE_ROLE_KEY`, `SECURITY_SMOKE_ANON_KEY`. Publishable key alias: `STAGING_SUPABASE_PUBLISHABLE_KEY`.

The script also loads `.env` for convenience, but **credentials must use the staging / `SECURITY_SMOKE_*` names above**. It will not fall back to `VITE_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.

Known production project ref `snzhnkcccbxkwerbaido` is always denylisted.

### Example (PowerShell)

```powershell
$env:SECURITY_SMOKE_TARGET = "staging"
$env:SECURITY_SMOKE_ACK_NON_PRODUCTION = "I_UNDERSTAND_STAGING_ONLY"
$env:STAGING_SUPABASE_URL = "https://<staging-ref>.supabase.co"
$env:STAGING_SUPABASE_SERVICE_ROLE_KEY = "<staging-service-role>"
$env:STAGING_SUPABASE_ANON_KEY = "<staging-anon>"
npm run test:live:security
```

### Example (local Supabase)

```bash
export SECURITY_SMOKE_TARGET=local
export SECURITY_SMOKE_ACK_NON_PRODUCTION=I_UNDERSTAND_STAGING_ONLY
export STAGING_SUPABASE_URL=http://127.0.0.1:54321
export STAGING_SUPABASE_SERVICE_ROLE_KEY=<local-service-role>
export STAGING_SUPABASE_ANON_KEY=<local-anon>
npm run test:live:security
```

Apply the security / daily-play migrations and deploy Edge Functions (`moderation`, `account-data`, `select-daily-puzzles`) on the target before expecting full coverage. Missing RPCs or undeployed functions are **skipped**, not treated as passes for that surface.

## What it covers

- Cross-user `player_stats` / `day_progress` read/write denial
- Direct client DML on locked economy tables (`user_achievements`, `user_point_balances`, `user_rewarded_ad_claims`, `daily_completions`) and `app_private.point_transactions`
- Self-owner grant via `moderation_grant_role` / `user_roles`
- Spoofed `actor_id` / unauthenticated Edge calls (`moderation`, `account-data`); cron probe without `CRON_SECRET` for `select-daily-puzzles`
- Today’s `daily_puzzles.answer_id` not selectable via table SELECT
- Authenticated `get_daily_play_state` / active attempt RPCs omit `answer_id`
- Anon `get_daily_play_state` may include `answer_id` for guest local validation (Wordle-style)
- Guess idempotency + past-max / terminal rejection; deprecated `complete_daily_mode_with_reward`
- Deprecated bonus boolean, wrong bonus guess, disabled `claim_rewarded_ad_points`, idempotent cosmetic `report_secret_event`

## CI policy

Do **not** enable a GitHub Actions job that could point at production. The `staging-smoke` job in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) stays `if: false` until a durable staging project and **staging-only** GitHub secrets exist. When enabling later, wire only `STAGING_*` secrets — never production service role keys — and keep this script behind the same ack/target guards.

Unit coverage for the fail-closed guard lives in `scripts/lib/security-smoke-guards.test.mjs` (runs with `npm test`).

## Related

- [deployment.md](../deployment.md) — preview → staging Supabase, hosted Auth checklist
- [moderation.md](../moderation.md) — roles, Edge Function actor derivation
- [migration-drift.md](./migration-drift.md) — apply hardening SQL on staging before production
