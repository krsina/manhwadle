# Achievements Style Guide

Canonical rules for **Milestones** (progressive ladders) and **Hush-Hush** (secrets). Inspired by osu!’s Hush-Hush medals, flavored for manhwa / webtoon / cultivation culture, without copying franchise names or assets.

**Source of truth for display copy and thresholds:** `src/lib/achievements.ts`  
**Authoritative grants:** Postgres (`achievement_definitions` + award RPCs). Keep client and migrations in sync.

---

## Goals

- Celebrate verified play with readable ladders (completions, streaks, full clears).
- Hide playful secrets behind natural product actions (theme, shop, Konami, hiatus returns, founding signup, etc.).
- Sound like Manhwadle: witty, short, manhwa-literate, never corporate.
- Keep unlocks fair: server-verified for ladders; secrets are server-claimed (client triggers or metric-backed hush).
- Avoid stacking that makes Cascade trivial on forced twins (e.g. first finish + day-1 streak).

## Non-goals

- Do **not** use competitive ladder criteria for hard mode or hints.
- Do **not** reward “opened the tab” visit-day or visit-streak ladders (play ladders already incentivize showing up).
- Do **not** copy osu! medal names, icons, or copy verbatim.
- Do **not** put UTC, timezone jargon, or internal metric names in user-facing text.
- Do **not** use em dashes (`—`) in titles or descriptions.
- Do **not** toast every historical award on first load (seed “seen” silently; toast only new ones).

---

## Product vocabulary

| Internal | User-facing |
| --- | --- |
| achievements | **Milestones** (page, home section, empty states) |
| category `secret` | **Hush-Hush** |
| unlock celebration | Type kicker (Completions / Streaks / Full clears / Hush-Hush) + shop points line |
| detail inspect | “Milestone” kicker (no confetti) |

UI section order on the full catalog: Completions → Streaks → Full clears → Hush-Hush.

---

## Categories

| Category | UI label | What it measures | Flavor lean |
| --- | --- | --- | --- |
| `completions` | Completions | Lifetime verified daily mode finishes | Series / publishing arcs |
| `streak` | Streaks | Any-mode day streak (max); starts at **2** days | Weekly drops, cultivation, seasons |
| `all_mode` | Full clears | All required modes in a day; streak or banked clear-days | Party / tower / sweep |
| `secret` | Hush-Hush | Secret flags **or** metric-backed hush (hiatus returns) | Easter eggs, founding, comebacks |
| `visit` | (legacy) | Prefer `secret` for new hiatus seals; empty in catalog | — |

Hard mode and hints may appear as **secrets**, never as ladder gates.

---

## Copy rules

### Titles

- Prefer **2–4 words**. Questions and mild punctuation are OK when they land (`Who turned on the lights?`, `You came back!`).
- Sound like chapter titles, system messages, or reader slang—not HR badges (`First Login`, `Engagement Streak`).
- Progressive titles should escalate: early = tutorial energy; late = seasonal / lifetime weight.
- Secrets can be punchier and more opaque; the description may stay coy.

### Descriptions

- **One or two short sentences.**
- Progressive pattern: **requirement phrase** + **flavor punch**.  
  Example: `Finish 25 verified daily modes. No filler arcs allowed.`
- Secrets: often skip the literal how-to; tease the action.  
  Example: `You showed up while the ink was still wet.` (Early Bird; do **not** mention the signup window length.)
- Prefer “verified daily mode(s)” when the metric is server-backed completions.
- Ellipsis (`…`) is fine for cliffhanger tone (`Just one more chapter…`).

### Hard bans (user-facing)

- No em dashes (`—`). Use commas, periods, or hyphens if needed.
- No “UTC”, “timezone”, “cron”, “RPC”, or metric key names (`total_completions`, etc.).
- No spoiling secret *methods* in catalog blurbs that would turn Hush-Hush into a checklist (tile titles may hint; avoid step-by-step).

### Tone checklist

- Manhwa / webtoon literate (arcs, filler, hiatus, cultivation, dungeon, panels).
- Warm and slightly teasing; never mean-spirited about failure except playful secrets (`Panic Surrender`).
- Inclusive second person (“you”) for flavor lines.

---

## Progressive ladder design

1. **Early rungs are dense** (2, 3, 5, 7…) so new players feel progress without auto-pairing with Awakening.
2. **Mid rungs** hit weekly / monthly / seasonal beats (14, 30, 60, 100, 180…).
3. **Late rungs** stretch toward ~1–2 year horizons (365, 500, 730, 1000+ completions).
4. Each rung needs a **distinct title**—do not reuse “Streak N” style labels.
5. Thresholds must match the metric exactly; titles must not claim a different count than `threshold`.
6. Do **not** add a day-1 any-mode streak rung (it always pairs with first completion).

When adding a rung: update `ACHIEVEMENT_POINT_REWARDS`, `ACHIEVEMENT_BASE_DEFINITIONS`, SQL `achievement_definitions`, and any awarder path that reads thresholds.

---

## Hush-Hush (secrets) design

### When to add a secret

- Ties to a **real product action** players might do anyway (theme toggle, open shop, share result).
- Is discoverable without a wiki, or delightful if found by accident.
- Does not require griefing others or breaking the game.
- Meta secrets (e.g. **Cascade** for multiple seals in one award pass) are OK when server-counted.
- Hiatus returns (Regression, Second Life, Reincarnation, Protagonist Arc, Time Skip) are Hush-Hush with visit comeback metrics.
- **Early Bird** is founding signup within the first four months after launch epoch (server-checked; copy stays coy).

### Cascade

- Requires **3+** newly inserted awards in one award pass (ladder, completion secrets, or mix).
- Full Party + Clean Sweep alone (2) must **not** grant Cascade.

### Implementation pattern

| Layer | Responsibility |
| --- | --- |
| Client | Fire `reportSecretEvent(event)` from the interaction (`src/lib/secretEvents.ts`) when applicable |
| Server | `report_secret_event` / metric awarder / signup hydrate validates and awards |
| Catalog | `category: 'secret'`; `metric` is `secret_flag` **or** a visit comeback metric |
| UX | Site-wide unlock host (`AchievementUnlockHost`) toasts on any route |

Award RPCs are rate-limited where client-triggered; already-owned one-shots short-circuit without writing; Cascade is server-counted only (no client `multi_unlock` claim). Metric-backed hush seals are granted when `metric <> 'secret_flag'` in `award_achievements`.

### Naming

- Prefer IDs: `secret_<slug>` (snake_case) for new secrets.
- Legacy hiatus ids (`visit_comeback_*`, `visit_timeskip`) may keep their ids for existing `user_achievements` rows.
- Events: short snake_case verbs (`light_theme`, `dark_theme`, `konami`).

### Spoiler posture

- Locked Hush-Hush tiles may show title + coy description; do not print “Press ↑↑↓↓…” in the catalog.
- DEV test launcher may preview any award; that is not a spoiler surface for players.

---

## Point rewards

Shop points on unlock (`pointReward` / server grant). Typical bands:

| Band | Amount | Use |
| --- | --- | --- |
| Small | **25** | Early ladder rungs, light secrets |
| Medium | **50** | Mid rungs, meatier secrets |
| Large | **100** | Strong mid-late milestones / timing hush |
| Capstone | **200** | Deep ladder / long-horizon titles |

Milestone points increase `lifetime_earned` (level XP) and are **not** subject to the daily play-XP cap (see `docs/play-xp-leveling.md`).

Do not invent one-off amounts outside these bands without a product reason.

---

## IDs and metrics

### ID conventions

| Pattern | Example |
| --- | --- |
| First completion special-case | `first_completion` |
| Completions ladder | `completions_<n>` |
| Any-mode streak | `any_streak_<n>` (no `_1`) |
| All-mode / clear-day mix | `all_mode_day`, `all_mode_days_<n>`, `all_mode_streak_<n>` |
| Hiatus hush | `visit_comeback_<n>`, `visit_timeskip` |
| Secrets | `secret_<slug>` (e.g. `secret_early_bird`) |

### Metrics

Only use metrics declared on `AchievementDefinition.metric` and mirrored by the server awarder. Classic secrets use `secret_flag`; hiatus hush uses `visit_comebacks` / `visit_long_comebacks`.

---

## Unlock UX

- **Unlock modal:** confetti, type kicker, title, description, `◆ N shop points`, Continue.
- **Detail modal:** quieter inspect from badge click; shows earned date when known.
- **Seen tracking:** `manhwadle:achievements:seen-v1` via `consumeNewAchievementIds`—first hydrate seeds without toasting; later new IDs toast.
- **Notify:** after server awards may have changed, call `notifyAchievementsChanged()` so the host refetches.
- Toast host lives in layout so secrets earned off Home still celebrate.

---

## Visual language

- Badge “seal” icons are category-tinted SVG marks (`AchievementIcon`); colors live under `.achievement-<category>` in `src/styles.css`.
- Completions / streaks / full clears / secrets each have a distinct mark gradient—keep new categories from collapsing into purple-glow defaults.
- Locked catalog tiles stay muted (`is-locked`); earned tiles stay readable at home chip size and milestones grid size.
- Prefer crisp, readable seals over ornate illustration; icons should survive ~30–40px marks.

When adding a category: extend CSS tint tokens, `achievementCategoryLabel`, and catalog section title/blurb helpers together.

---

## Sync checklist (new or edited award)

1. Add/update definition + points in `src/lib/achievements.ts`.
2. Mirror row in a Supabase migration (`achievement_definitions` upsert/insert).
3. Wire award path (ladder metric awarder, signup hydrate, **or** `report_secret_event` branch + client `reportSecretEvent`).
4. Add/adjust icon branch in `AchievementIcon` if the id needs a unique glyph.
5. Update tests that assert catalog size, parsing, or copy bans if present.
6. Apply migration to remote before expecting live unlocks.
7. Manually smoke: earn → toast → points → milestones tile unlocked.

---

## Voice examples

| Do | Don’t |
| --- | --- |
| `Reach a 7-day any-mode streak. Reliable as a weekly upload.` | `Maintain a streak of 7 days (UTC).` |
| `Who turned on the lights?` / `You banished the shadows. The dungeon squints.` | `Enable light theme in settings.` |
| `Finish every required mode on a single day. Party wipe averted.` | `Complete all modes — great job!` |
| `You showed up while the ink was still wet.` | `Sign up within the first 4 months of launch.` |

---

## Related code

| Area | Path |
| --- | --- |
| Catalog | `src/lib/achievements.ts` |
| Seen / notify | `src/lib/achievementUnlocks.ts` |
| Secret client API | `src/lib/secretEvents.ts` |
| Unlock host | `src/components/AchievementUnlockHost.tsx` |
| Unlock / detail UI | `src/components/AchievementUnlockModal.tsx` |
| Icons | `src/components/AchievementIcon.tsx` |
| Catalog UI | `src/components/AchievementBadges.tsx`, `src/pages/MilestonesPage.tsx` |
| Rebalance migration | `supabase/migrations/20260720232417_achievement_rebalance_early_bird_cascade.sql` |
