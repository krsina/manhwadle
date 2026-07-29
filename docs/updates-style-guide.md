# Updates style guide

Public changelog for `/updates`. Write for players, not for the git log.

## Latest published version

**`1.0.2`** (Clearer Archive, Character, and Updates)

Keep this line in sync with the newest **published** row in `site_updates`. Whenever a new version ships (via `/write-site-update`, Moderation, or a manual edit), update:

1. This **Latest published version** line
2. The **Example (preferred)** version / title / body below so they match that post
3. The **Good example** in `.cursor/skills/write-site-update/SKILL.md`

Do not leave the guide or skill pointing at an older version after a publish.

## Canonical format: Brief

Every update uses this shape:

1. **Version** - product version for this ship (see Versioning)
2. **Title** - names the theme (≤ ~60 characters)
3. **Lead** - one short sentence on the point of the ship
4. **Blank line**
5. **Bullets** - 2–5 player-facing changes

Plain text only. No markdown headings, bold, or links.

Do not use em dashes (`—`). Prefer commas, periods, colons, or parentheses.

### Example (preferred)

**Version:** `1.0.2`

**Title:** Clearer Archive, Character, and Updates

**Body:**
```
Small polish across home, Character, and Updates so past puzzles, bonus names, and post times are easier to follow.

• Archive label and calendar on home highlight together on hover
• Character results put the cast name under the series title after you guess it
• Bonus name suggestions scroll cleanly on phones without clipping celebrations
• Updates timestamps show the UTC time, not just the date
```

## Versioning

Each published post carries a **version** string shown next to the date.

Manhwadle is a **public `1.x` product**. Use **semver-style** `MAJOR.MINOR.PATCH`:

| Bump | When |
| --- | --- |
| **MAJOR** | Rare. Breaking change to how daily play works, or a big product reset players must notice. |
| **MINOR** | New player-facing feature, mode change, shop roster, or themed UX ship. Typical Updates post. |
| **PATCH** | Small fixes, copy tweaks, art polish, or follow-ups that do not change the main loop. |

Rules:

- Version is required for published posts.
- One version per post. Do not reuse a version on a later post.
- Versions must move forward (`1.0.0` → `1.0.1` or `1.1.0`, never backwards).
- Put the version in the **version field**, not in the title. Titles stay thematic; the page shows version + date.
- Before choosing a number, read **Latest published version** above and/or query live `site_updates` versions.
- After publishing, update **Latest published version** and both examples (this guide + the skill) in the same change.

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

## Body rules

- Lead: one sentence that frames *why this ship matters*.
- Bullets: each line starts with `• ` (bullet character + space).
- Group related items in one bullet when useful (“Avatar shop: …”).
- Aim for a phone-screen skim: roughly 40–90 words.
- If you need more than five bullets, split into two updates or cut the least player-visible items.

## What to include

| Include | Skip |
| --- | --- |
| New modes, shop items, UI players will notice | SQL, RLS, edge functions, CI |
| Bug fixes players hit | Renames of internal IDs |
| Art refreshes that change how avatars look | WIP / unreleased experiments |
| Policy or schedule changes that affect play | “Refactored X for maintainability” |

## Do / don’t

- Do write the lead so someone could skim title + lead and still get the idea.
- Do keep bullets concrete and scannable.
- Do set a version that matches how big the ship feels (MINOR vs PATCH).
- Do keep this guide and the write-site-update skill examples on the latest published version.
- Don’t list every file or avatar slug unless the name is shop-facing.
- Don’t announce the Updates page every time. Only on first launch or major changes to it.
- Don’t promise upcoming work in the same post as shipped changes (use a separate post if needed).
- Don’t drop the lead to go “bullets only”. Brief is the house style.
- Don’t use em dashes.

## Checklist before publish

- [ ] Version set and not reused (newer than **Latest published version**)?
- [ ] Title + lead make sense without reading the bullets?
- [ ] Would a casual player understand every bullet?
- [ ] Is anything in here only useful to you as the developer?
- [ ] Slug looks shareable (`easier-play-on-phones`, not `update-7-29`)?
- [ ] No em dashes in title or body?
- [ ] Published only when the matching code is actually live for players?
- [ ] After publish: guide + skill examples updated to the new version?
