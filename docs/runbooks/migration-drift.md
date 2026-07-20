# Migration drift

Local SQL under `supabase/migrations/` is the **schema source of truth**. Remote `schema_migrations` history must stay reconcilable with those filenames before new hardening SQL ships.

## Read-only check

```bash
npm run check:migration-drift
```

What it does:

1. Lists `*.sql` filenames under `supabase/migrations/` (14-digit version prefix).
2. Runs `supabase migration list --linked --output-format json` (or `--db-url` when set).
3. Compares local versions to the CLI **remote** column only.
4. Exits `0` when sets match; `1` on drift or CLI/config failure.

Secrets (DB URL, password, tokens) are never printed — error text is redacted.

### Inputs

| Input | Purpose |
| --- | --- |
| Linked project (`supabase link` + `supabase/config.toml` `project_id`) | Default remote target |
| `SUPABASE_DB_URL` / `--db-url` | Percent-encoded Postgres URL instead of `--linked` |
| `SUPABASE_DB_PASSWORD` / `--password` | Optional password for linked mode |

Also loads `.env` the same way other live scripts do; values are not logged.

### Companion check

`npm run check:migrations` only asserts **local** timestamp uniqueness. Run both before schema changes.

## Interpreting drift

| Class | Meaning | Typical action |
| --- | --- | --- |
| Local only | File in repo, not in remote history | Apply on staging (`supabase db push` / migrate), or mark applied if SQL already landed outside history |
| Remote only | Version on remote, no matching local file | Recover file from history/backup, or `migration repair --status reverted` after confirming the change is obsolete |
| Both (matched) | Same version present locally and remotely | No action |

Renames that change the 14-digit prefix look like **local only + remote only** for the old/new stamps. Prefer **new forward migrations** over rewriting applied files.

## Repair (ops — not part of the check script)

Work on **staging first**. Snapshot / PITR note before history edits — see [backups & keys](./backups-and-keys.md).

1. Export current history: `npx supabase migration list --linked`.
2. Map each remote version → local filename (or “Dashboard / renamed / advisory-only”).
3. Content already on the DB but missing from history:

   ```bash
   npx supabase migration repair --status applied --linked <version...>
   ```

4. History rows that must not stay applied (after confirming SQL is gone / superseded):

   ```bash
   npx supabase migration repair --status reverted --linked <version...>
   ```

5. Local files never applied: migrate normally on staging, verify app + negatives, then production.
6. Re-run `npm run check:migration-drift` until green (or until remaining local-only rows are intentional pending applies).

**Do not** delete or rewrite applied migration files to “fix” drift. Add forward migrations instead.

### Hotspots

- Local-oriented or renamed stamps (e.g. `20260720063000_local_account_menu_secret.sql`) often diverge from live advisory patches.
- Live-only advisory versions with empty local column in `migration list` need an explicit map before the next `db push`.

## When to run

- Before any production schema change or hardening migration.
- After Dashboard SQL / one-off repairs.
- When `db push` complains about history mismatches.
