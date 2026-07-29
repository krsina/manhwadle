# Updates style guide

Public changelog for `/updates`. Write for players, not for the git log.

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

**Version:** `0.2.0`

**Title:** Easier play on phones

**Body:**
```
This ship focuses on reading clues without the UI getting in the way, especially on smaller screens.

• Known and Ruled out fold away behind short summaries on mobile
• Guess feedback is lighter on phones (softer reveals, fewer overflowing tags)
• After a Character round, the answer name appears under the portrait
• Shop: free Explorer avatars, updated starter options, and refreshed Style A art (including Plum Blossom Blade)
```

## Versioning

Each published post carries a **version** string shown next to the date.

Use **semver-style** `MAJOR.MINOR.PATCH`:

| Bump | When |
| --- | --- |
| **MAJOR** | Rare. Breaking change to how daily play works, or a big product reset players must notice. |
| **MINOR** | New player-facing feature, mode change, shop roster, or themed UX ship. Typical Updates post. |
| **PATCH** | Small fixes, copy tweaks, art polish, or follow-ups that do not change the main loop. |

Rules:

- Version is required for published posts.
- One version per post. Do not reuse a version on a later post.
- Versions should move forward over time (`0.2.0` then `0.2.1` or `0.3.0`, never go backwards).
- Put the version in the **version field**, not in the title. Titles stay thematic; the page shows version + date.

Starting point for early Manhwadle: `0.x.y` until you declare a public `1.0.0`.

## Voice

- Clear, direct, a little warm. Not marketing hype.
- Second person is fine (“you can…”) when it helps; otherwise stick to what shipped.
- Prefer concrete nouns over vague praise (“cleaner mobile layout” > “huge improvements”).
- Lead with the player outcome, not the implementation.

## Title rules

- Name the theme, not every bullet.
- Good: `Easier play on phones`
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
- Don’t list every file or avatar slug unless the name is shop-facing.
- Don’t announce the Updates page every time. Only on first launch or major changes to it.
- Don’t promise upcoming work in the same post as shipped changes (use a separate post if needed).
- Don’t drop the lead to go “bullets only”. Brief is the house style.
- Don’t use em dashes.

## Checklist before publish

- [ ] Version set and not reused?
- [ ] Title + lead make sense without reading the bullets?
- [ ] Would a casual player understand every bullet?
- [ ] Is anything in here only useful to you as the developer?
- [ ] Slug looks shareable (`easier-play-on-phones`, not `update-7-29`)?
- [ ] No em dashes in title or body?
- [ ] Published only when the matching code is actually live for players?
