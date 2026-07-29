---
name: write-site-update
description: >-
  Drafts and publishes Manhwadle public changelog posts for /updates using the
  Brief house style (version, title, lead sentence, bullets). Use when the user
  asks to write an update, changelog, site update, patch notes for players, or
  to post something to the Updates page.
---

# Write a site update

Draft player-facing `/updates` posts in Manhwadle’s **Brief** house style.

## Required reading

Before drafting, read and follow:

`docs/updates-style-guide.md` (repo root)

That guide is canonical. Do not invent alternate formats (no bullets-only, no single-paragraph-only) unless the user explicitly overrides for one post.

Hard rules from the guide:

- Always include a **version** (`MAJOR.MINOR.PATCH`).
- Never use em dashes (`—`).
- Do not put version or date in the title.

## Workflow

1. **Gather what shipped**
   - Prefer `git status` / `git diff` / recent commits against the tracking branch.
   - Translate changes into **player outcomes**. Drop migrations, tests, refactors, and tooling unless they change something visible.
   - Choose a version bump: MINOR for themed features, PATCH for small fixes (see the guide).

2. **Draft in Brief form**
   - Version required.
   - Title ≤ ~60 chars, thematic.
   - One lead sentence.
   - Blank line.
   - 2–5 bullets, each starting with `• `.
   - ~40–90 words total.
   - Plain text only. No em dashes.

3. **Present for approval**
   - Show **Version**, **Title**, **Body**, and a suggested **slug** (kebab-case from the title).
   - Unless the user already chose a draft, offer the Brief version as the only default.

4. **Publish only when asked**
   - Owner can edit on `/updates` when signed in, or use Moderation → **Updates**.
   - If they ask you to publish and owner tooling is available, create a **published** post with version, title, and body.
   - Do **not** publish while the matching UI/code is still unreleased unless they explicitly want a draft.

## Output template

```
Version: <MAJOR.MINOR.PATCH>
Title: <theme>

Body:
<one lead sentence>

• <player-facing change>
• <player-facing change>
• <optional grouped change>
```

## Good example

```
Version: 0.2.0
Title: Easier play on phones

Body:
This ship focuses on reading clues without the UI getting in the way, especially on smaller screens.

• Known and Ruled out fold away behind short summaries on mobile
• Guess feedback is lighter on phones (softer reveals, fewer overflowing tags)
• After a Character round, the answer name appears under the portrait
• Shop: free Explorer avatars, updated starter options, and refreshed Style A art (including Plum Blossom Blade)
```

## Anti-patterns

- Em dashes
- Git-log tone (“refactored KnownInfoPanel”, “added RLS policies”)
- Vague hype (“huge improvements”, “exciting update”)
- Missing version, or version stuffed into the title
- More than five bullets
- Skipping the lead sentence
- Publishing internal-only work
