# Git / PR flow style guide

**Goal:** green CI *before* merge — not “merge, then fix on main.”

This guide is the day-to-day commit → push → PR → merge habit for Manhwadle. Deployment topology (Pages, Supabase, branch protection) lives in [deployment.md](./deployment.md). Use this doc when shipping code.

---

## 1. Default flow

```text
main (or develop) → feat/<short-name> → PR → wait for quality → merge
```

1. Start from an up-to-date base (`main` for release-bound work; `develop` if that is your integration branch).
2. One concern per branch / PR (feature, fix, or docs — not a grab bag).
3. Push the branch, open a PR **into the intended base**, wait for **`quality`**.
4. Merge only when `quality` is green. Do not merge red and “fix after.”
5. If `develop` exists, fast-forward / merge `main` back into it after a release PR so the next branch starts clean.

**Never** push commits straight to `main` when branch protection is on. Prefer PRs even for tiny fixes so CI runs the same path every time.

**Docs / art / markdown-only:** after `paths-ignore` in CI, PRs that only touch `docs/**`, `art/**`, or `*.md` do **not** run the full `quality` job. Live shipped assets stay under `public/` — changing those still runs CI. A PR that mixes docs with `src/` (etc.) still runs full CI.

---

## 2. Preflight (run locally before push)

CI runs the sequence in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Mirror it before you push or ask for merge:

```bash
# Node must match .nvmrc (currently 22+)
node -v

npm ci
npm run check:secrets
npm run check:migrations
npm run lint
npm test
npm run build          # includes build:catalog
npm run check:dist
npx playwright install --with-deps chromium webkit   # once per machine / browser bump
npm run test:e2e
```

**Minimum bar for a UI or routing change:** `npm test` + `npm run build` + `npm run test:e2e`.  
**Minimum bar for SQL-only:** `npm run check:migrations` + relevant unit tests if any client parsers changed.

Skip e2e only when the diff cannot affect the app shell, routes, or critical-path UI (pure docs, comment-only, migration comments with no RPC contract change). When unsure, run e2e.

### Faster loops while coding

| Change type | Run often |
|---|---|
| Pure logic / parsers | `npm test -- --run path/to/file.test.ts` |
| Lint-sensitive files | `npm run lint` |
| New migration file | `npm run check:migrations` |
| UI / routes / Playwright-covered flows | full preflight before push |

---

## 3. Commit rules

- Commit message: short “why” (1–2 sentences). Match recent `git log` tone.
- Do **not** commit: `.env`, keys, `supabase/.branches/`, local catalog churn you did not intend, generated noise.
- Prefer small commits on the feature branch; squash is optional at merge time.
- If a pre-commit / CI fix is needed, make a **new** commit on the same PR — do not force-push over a shared branch unless you own it alone and say so.

---

## 4. PR rules

### Title / body

- Title: what the PR does for the product or CI (not a file list).
- Body: short Summary + Test plan checklist (what you ran locally + what CI must prove).

### Before you click Create

- [ ] Preflight above is green locally
- [ ] Base branch is correct (`main` vs `develop`)
- [ ] No secrets or accidental local files in the diff
- [ ] Migrations have a unique timestamp (`npm run check:migrations`)
- [ ] If UI changed: e2e assertions target **scoped** locators (see §6)

### After Create

- Wait for **`quality`** (required). Cloudflare Pages preview is useful QA, not a substitute for `quality`.
- If `quality` fails: fix on the **same PR**, push, re-wait. Do not merge and open a follow-up “CI fix” on main unless you already merged by mistake — then fix immediately with another PR.
- When shipping via the agent (`/git-pr-flow` / “open a PR” / “ship this”), **merge automatically once `quality` is green** unless the user asked for a draft or explicitly said not to merge.

### Merge

- Prefer **merge commit** or the repo’s usual button once green.
- Delete the feature branch after merge.
- Sync `develop` ← `main` when both are in use so the next branch is not behind.

---

## 5. What CI actually gates

| Step | Catches |
|---|---|
| `check:secrets` | Accidental key / token commits |
| `check:migrations` | Duplicate migration timestamps |
| `lint` | oxlint issues |
| `npm test` | Unit / parser regressions |
| `build` + `check:dist` | Typecheck, catalog build, bundle budget |
| `test:e2e` | Critical Playwright paths (chromium / webkit) |

`staging-smoke` is stubbed off until live staging secrets are wired ([deployment.md](./deployment.md)). Do not treat a skipped staging job as “security verified.”

---

## 6. Failure patterns we keep hitting (and how to avoid them)

### A. Unit tests pinned to asset cache-bust versions

**Symptom:** `PixelAvatar` / composition tests fail after `?v=` bump.  
**Avoid:** Assert against helpers like `avatarAssetUrl(...)` (or shared constants), not a hard-coded `v=N` string. When you bump cache versions, run `npm test` before push.

### B. Playwright strict-mode / overlapping alerts

**Symptom:** `getByRole('alert')` matches **two** errors (e.g. board load failed *and* search failed).  
**Avoid:** Scope assertions to the region under test (e.g. `.leaderboard-search`), or match specific text. Assume CI has **no live Supabase** — guest paths often show load errors; tests must accept “error or empty/no-match,” not only the happy path.

### C. Node / engine drift

**Symptom:** CI or Pages disagrees with local Node.  
**Avoid:** Keep `.nvmrc`, `package.json` `engines`, and [deployment.md](./deployment.md) Pages Node setting in sync (22 LTS). Run `node -v` before preflight.

### D. E2E written against a live backend / local `.env`

**Symptom:** Search / leaderboard / auth tests pass locally with `.env` but fail in CI.  
**Avoid:** Critical-path e2e must work with unconfigured / empty cloud. Prefer UI contract checks (submit path, scoped error/status) over “row X appears from staging.”

**Auth chrome specifically:** `AuthButton` returns `null` when Supabase env is missing, so CI has **no** header “Sign in” control. Locally, `npm run build` embeds `VITE_*` from `.env` into `dist`, and `test:e2e` serves that preview — so Sign in appears locally even though CI never had those secrets. Do not require Sign in / account chip unless the test branches (present → assert; absent → OK), same pattern as shop unlock CTAs that accept `Sign in to unlock|Unavailable`.

When adding auth-sensitive e2e: assert shell chrome that always exists (brand, Preferences, theme), or rebuild/`preview` without Supabase env before trusting a green local run.
### E. Migration timestamp collisions

**Symptom:** `check:migrations` fails in CI.  
**Avoid:** One new file per change; timestamp must be unique. Run `npm run check:migrations` after adding SQL.

### F. Merging on red / fixing on main

**Symptom:** “Merge pull request #N” CI fails on `main` after the PR already looked done.  
**Avoid:** Never merge until the **PR’s** `quality` check is green on the **merge commit’s** head. If you use admin bypass, you own the immediate fix PR. Prefer branch protection that blocks merge on failed `quality` ([deployment.md §4](./deployment.md#4-protect-main-github)).

---

## 7. Agent / CLI checklist (when shipping via `gh`)

```bash
# Auth once (token or gh auth login) — then:
git status
git diff
npm test && npm run lint && npm run build && npm run test:e2e   # or full §2 preflight

git checkout -b feat/<name>
# …commit only intended files…
git push -u origin HEAD
gh pr create --base main --title "…" --body "…"
gh pr checks <n> --watch
gh pr merge <n> --merge --delete-branch
# if using develop:
git checkout develop && git pull && git merge origin/main && git push
```

Default agent behavior for “open a PR” / “ship this”: run through **merge** after green `quality`. Stop before merge only if the user asks for a draft or says not to merge.

Do not start interactive `gh auth login --web` in non-interactive agent shells; use an existing credential / `GH_TOKEN`.

---

## 8. Definition of done

A change is done when:

1. Local preflight matching CI is green (or honestly N/A for docs-only).
2. PR `quality` is green.
3. PR is merged.
4. Integration branch (`develop`) is caught up if you use one.
5. Staging/production Supabase has any new migrations applied **before** (or with) the app that needs them — see [deployment.md](./deployment.md) and [runbooks/migration-drift.md](./runbooks/migration-drift.md).

If step 2 fails, stay on the PR until it is green. That is the whole point of this guide.
