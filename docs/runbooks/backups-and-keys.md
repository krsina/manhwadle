# Backups and key rotation

## Database backups

- Prefer Supabase automatic backups / PITR on the paid plan used for production.
- Before risky migrations: take a manual dump or snapshot and note the migration version.
- Store restore steps with the staging rehearsal date.

## Key inventory

| Secret | Where | Rotate when |
| --- | --- | --- |
| Supabase service role | Edge Functions / CI secrets only | Leak suspicion, staff offboarding |
| Supabase anon / publishable | Pages env (`VITE_*`) | Project rebuild / compromise |
| PostHog project key | Pages env | Project reset |
| OAuth client secrets | Supabase Auth providers | Provider rotation policy |
| Cloudflare API tokens | Account dashboard | Least privilege; rotate on leave |

## Rotation checklist

1. Create new secret; update Supabase / Pages / GitHub Environments.
2. Redeploy Edge Functions and Pages.
3. Revoke old secret.
4. Verify auth login, ranked sync smoke, and moderation action still work on staging.

Never commit secrets. `.env` is gitignored; only `.env.example` is tracked.
