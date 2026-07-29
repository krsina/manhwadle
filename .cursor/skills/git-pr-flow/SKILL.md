---
name: git-pr-flow
description: >-
  Ships Manhwadle changes via the repo git/PR flow: feature branch, local
  preflight, push, PR, wait for quality, merge only when green. Use when the
  user asks to open a PR, create a pull request, ship a branch, run preflight,
  merge a PR, or follow the git/PR flow style guide.
---

# Git / PR flow

Ship code the Manhwadle way: **green CI before merge**, not merge-then-fix.

## Required reading

Before acting, read and follow:

`docs/git-pr-flow-style-guide.md` (repo root)

That guide is canonical. Also respect the user’s git safety rules (no force-push to main/master, no amend unless allowed, no committing secrets, only commit when asked, only push/PR when asked).

Related: `docs/deployment.md` for Pages / Supabase / branch protection topology.

## Default flow

```text
main (or develop) → feat/<short-name> → PR → wait for quality → merge
```

1. Start from an up-to-date base (`main` for release-bound work; `develop` if that is the integration branch).
2. One concern per branch / PR.
3. Preflight locally (§2 of the guide).
4. Push, open PR into the **correct base**, wait for **`quality`**.
5. Merge only when `quality` is green. Never merge red to “fix after.”
6. If both `develop` and `main` are used, sync `develop` ← `main` after a release merge.

Never push straight to `main` when protection is on. Prefer a PR even for tiny fixes.

## When the user asks to ship / open a PR

Copy this checklist and work it in order:

```text
PR Progress:
- [ ] Confirm base branch and branch name (feat|fix|docs)/<short-name>
- [ ] Confirm only intended files will be committed
- [ ] Run preflight appropriate to the diff
- [ ] Commit (only if user asked) with a short “why” message
- [ ] Push -u and create PR with Summary + Test plan
- [ ] Watch quality; fix on the same PR if red
- [ ] Merge only when green (only if user asked)
- [ ] Delete feature branch; sync develop if needed
```

### Preflight (mirror CI)

Full sequence from the guide / `.github/workflows/ci.yml`:

```bash
node -v   # must match .nvmrc (22+)
npm ci
npm run check:secrets
npm run check:migrations
npm run lint
npm test
npm run build
npm run check:dist
npm run test:e2e
```

Minimum bars:

- **UI / routing:** `npm test` + `npm run build` + `npm run test:e2e`
- **SQL-only:** `npm run check:migrations` (+ relevant unit tests if client parsers changed)
- **Docs / art / markdown-only:** full `quality` may be skipped by `paths-ignore`; still don’t mix with `src/` accidentally
- When unsure whether e2e matters, run e2e

### PR title / body

- Title: product or CI outcome, not a file list
- Body: short Summary + Test plan checklist (what ran locally + what CI must prove)

Use `gh pr create` with a HEREDOC body. Push with `-u` if the branch has no upstream. Do not start interactive `gh auth login --web` in non-interactive shells.

### After create

- Wait for **`quality`** (required). Pages preview is useful QA, not a substitute.
- On failure: fix on the **same PR**, push, re-wait.
- Merge with the repo’s usual strategy; delete the feature branch after.

## Hard rules (do not violate)

- Do not merge on red `quality`.
- Do not commit `.env`, keys, `supabase/.branches/`, or unintended local catalog churn.
- New migration timestamps must be unique (`npm run check:migrations`).
- If a hook/CI fix is needed, add a **new** commit (no force-push on shared branches unless alone and stated).
- Never update git config.
- Never force-push to `main` / `master`.
- Only commit / push / open / merge when the user asked for that step (or clearly asked to “ship” end-to-end).

## Recurring failure patterns

Before push, skim guide §6. Especially:

- Don’t hard-code avatar `?v=` in tests; use `avatarAssetUrl(...)`.
- Scope Playwright alerts (CI has no live Supabase).
- Auth “Sign in” is absent in CI when Supabase env is missing; don’t require it unconditionally.
- Keep Node 22 aligned across `.nvmrc`, `engines`, and Pages.

## Definition of done

1. Local preflight green (or honestly N/A for docs-only).
2. PR `quality` green.
3. PR merged (when requested).
4. `develop` caught up if used.
5. Supabase migrations applied before/with the app that needs them (`docs/deployment.md`, `docs/runbooks/migration-drift.md`).
