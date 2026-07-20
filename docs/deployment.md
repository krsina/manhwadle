# Deployment

Manhwadle’s production surface is the **player app only** (`index.html` + Vite assets).
Library / character-image tools use `vite.tools.config.ts` and must not ship in `dist/`.

## Environments

| Env | Purpose | Notes |
| --- | --- | --- |
| Local | `npm run dev` | Player app. Tools: `npm run library` / `npm run review:images` |
| Preview | Cloudflare Pages preview deploys | Same build as production; use staging Supabase vars |
| Staging | Dedicated Pages project or branch | Apply migrations + Edge Functions before QA |
| Production | Custom domain on Cloudflare Pages | Promote only after staging gates |

## Cloudflare Pages

1. Build command: `npm ci && npm run build:catalog && npm run build`
2. Output directory: `dist`
3. Root directory: repository root
4. Node version: `20` (see `.nvmrc` / `package.json` engines)
5. Compatibility: `_headers` and `_redirects` in `public/` are copied into `dist/`

### Required browser env (Pages → Settings → Environment variables)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable / anon only)
- Optional: `VITE_SENTRY_DSN` (no replay; only when monitoring is justified)

Never set `SUPABASE_SERVICE_ROLE_KEY` in Vite / Pages browser env.

### Staging auth redirects

In Supabase Auth URL config, allow:

- `http://localhost:5173/**`
- staging Pages URL `/**`
- production origin `/**`

## Rollback

1. Cloudflare Pages → Deployments → retry previous successful deployment (instant rollback).
2. If a bad migration shipped, restore DB from backup **before** re-promoting app code that depends on it.
3. Keep the prior `dist` artifact / deployment ID in the incident notes.

## Prelaunch checks

```bash
npm run check:contact   # fails while contact placeholder remains
npm run check:dist      # tools/audits excluded + bundle budgets
```

Configure `src/lib/siteContact.ts` before production.

## Related runbooks

- [Uptime & incidents](./runbooks/uptime-and-incidents.md)
- [Backups & key rotation](./runbooks/backups-and-keys.md)
- [Daily puzzles](./runbooks/daily-puzzles.md)
- [Moderation incidents](./runbooks/moderation-incidents.md)
