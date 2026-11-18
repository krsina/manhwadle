# News style guide

Public posts for `/news` (legacy `/updates` redirects here). Write for players, not for the git log.

The page shows two **kinds** of posts:

| Kind | Badge on the page | Version | Use for |
| --- | --- | --- | --- |
| **`update`** | Release update | Required (`MAJOR.MINOR.PATCH`) | Patch notes and feature ships |
| **`announcement`** | Announcement | Optional | Schedule notes, policy, maintenance, one-off notices |

Release updates still use the **Brief** body shape below. Announcements may drop the bullet list when a short lead is enough, but keep the same plain-text rules.

## Latest published version

**`1.4.0`** (Heardle moves to the footer)

Keep this line in sync with the newest **published `update`** row in `site_updates` that carries a version. Whenever a new release update ships (via `/write-site-update`, Moderation → News, or a manual edit), update:

1. This **Latest published version** line
2. The **Example (preferred)** version / title / body / kind below so they match that post
3. The **Good example** in `.claude/skills/write-site-update/SKILL.md`

Do not leave the guide or skill pointing at an older version after a publish. Announcements do not move this stamp unless they also ship a versioned release update.

## Canonical format: Brief (release updates)

Every **release update** uses this shape:

1. **Kind** - `update`
2. **Version** - product version for this ship (see Versioning)
3. **Title** - names the theme (≤ ~60 characters)
4. **Lead** - one short sentence on the point of the ship
5. **Blank line**
6. **Bullets** - 2–5 player-facing changes

Plain text only. No markdown headings, bold, or links.

Do not use em dashes (`—`). Prefer commas, periods, colons, or parentheses.

### Example (preferred)

**Kind:** `update`

**Version:** `1.4.0`

**Title:** Heardle moves to the footer

**Body:**
```
The daily set is now Summary, Character, and Cover, and Heardle stays on as an optional side mode.

• Heardle is still here every day. Find it in the footer at the bottom of any page.
• The homepage, mode tabs, and Up next prompts now focus on the three daily modes.
• All-mode streaks only need Summary, Character, and Cover from now on, so skipping Heardle will not break your run.
```

### Announcement shape

Announcements use the same title and plain-text rules. Version is optional. Prefer a lead plus at most a few bullets; a single paragraph is fine when there is nothing to list.

**Kind:** `announcement`

**Title:** Weekend maintenance window

**Body:**
```
A short maintenance window is planned this weekend.

Daily puzzles will still appear; cloud sync may briefly pause.
```

## Versioning

Each published **release update** carries a **version** string shown next to the date as `vX.Y.Z`.

Manhwadle is a **public `1.x` product**. Use **semver-style** `MAJOR.MINOR.PATCH`:

| Bump | When |
| --- | --- |
| **MAJOR** | Rare. Breaking change to how daily play works, or a big product reset players must notice. |
| **MINOR** | New player-facing feature, mode change, shop roster, or themed UX ship. Typical News release update. |
| **PATCH** | Small fixes, copy tweaks, art polish, or follow-ups that do not change the main loop. |

Rules:

- Version is required for published posts with kind `update`.
- Announcements may omit version; if you set one, it still must be unique and forward-moving.
- One version per post. Do not reuse a version on a later post.
- Versions must move forward (`1.0.0` → `1.0.1` or `1.1.0`, never backwards).
- Put the version in the **version field**, not in the title. Titles stay thematic; the page shows kind + version + date.
- Before choosing a number, read **Latest published version** above and/or query live `site_updates` versions.
- After publishing a versioned release update, update **Latest published version** and both examples (this guide + the skill) in the same change.

## Voice

- Clear, direct, a little warm. Not marketing hype.
- Second person is fine (“you can…”) when it helps; otherwise stick to what shipped.
- Prefer concrete nouns over vague praise (“cleaner mobile layout” > “huge improvements”).
- Lead with the player outcome, not the implementation.

## Title rules

- Name the theme, not every bullet.
- Good: `Guest dailies stay on target`
- Avoid: `Various bug fixes and improvements`
- Do not put the version or date in the title (both are shown automatically).
- Do not put “Announcement” or “Release update” in the title; the kind badge covers that.

## Body rules

- Lead: one sentence that frames *why this ship matters*.
- Bullets: each line starts with `• ` (bullet character + space).
- Group related items in one bullet when useful (“Avatar shop: …”).
- Aim for a phone-screen skim: roughly 40–90 words.
- If you need more than five bullets, split into two posts or cut the least player-visible items.

## What to include

| Include | Skip |
| --- | --- |
| New modes, shop items, UI players will notice | SQL, RLS, edge functions, CI |
| Bug fixes players hit | Renames of internal IDs |
| Art refreshes that change how avatars look | WIP / unreleased experiments, owner-only / local-dev tools |
| Policy or schedule changes that affect play | “Refactored X for maintainability” |
| News comments or moderation players will feel | Staff-only dashboards |

## Do / don’t

- Do pick the right **kind** (`update` vs `announcement`) before drafting.
- Do write the lead so someone could skim title + lead and still get the idea.
- Do keep bullets concrete and scannable.
- Do set a version that matches how big the ship feels (MINOR vs PATCH) for release updates.
- Do keep this guide and the write-site-update skill examples on the latest published version.
- Don’t list every file or avatar slug unless the name is shop-facing.
- Don’t announce the News page every time. Only on first launch or major changes to it.
- Don’t promise upcoming work in the same post as shipped changes (use a separate announcement if needed).
- Don’t drop the lead to go “bullets only” on release updates. Brief is the house style.
- Don’t use em dashes.
- Don’t publish owner-only or local-dev tooling as if players can open it.

## Checklist before publish

- [ ] Kind set (`update` or `announcement`)?
- [ ] If `update`: version set and not reused (newer than **Latest published version**)?
- [ ] Title + lead make sense without reading the bullets?
- [ ] Would a casual player understand every bullet?
- [ ] Is anything in here only useful to you as the developer?
- [ ] Slug looks shareable (`versus-lobbies-and-news-comments`, not `update-8-11`)?
- [ ] No em dashes in title or body?
- [ ] Published only when the matching code is actually live for players?
- [ ] After publish of a versioned release update: guide + skill examples updated to the new version?
