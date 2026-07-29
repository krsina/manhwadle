---
name: write-site-update
description: >-
  Drafts and publishes Manhwadle public changelog posts to Supabase so they
  appear on /updates, using the Brief house style (version, title, lead,
  bullets). Use when the user asks to write an update, changelog, site update,
  patch notes for players, publish to Updates, or post something to the Updates
  page.
---

# Write a site update

Draft player-facing `/updates` posts in Manhwadle’s **Brief** house style, then
**write them to Supabase** so they are visible on the live site.

## Required reading

Before drafting, read and follow:

`docs/updates-style-guide.md` (repo root)

That guide is canonical. Do not invent alternate formats (no bullets-only, no single-paragraph-only) unless the user explicitly overrides for one post.

Hard rules from the guide:

- Always include a **version** (`MAJOR.MINOR.PATCH`).
- Never use em dashes (`—`).
- Do not put version or date in the title.

## Workflow

Treat “write an update” / `/write-site-update` as **draft → approve → publish to Supabase**, unless the user asks for a draft only.

1. **Gather what shipped**
   - Prefer `git status` / `git diff` / recent commits against the tracking branch (and merged PRs if that is the ship).
   - Translate changes into **player outcomes**. Drop migrations, tests, refactors, and tooling unless they change something visible.
   - Choose a version bump: MINOR for themed features, PATCH for small fixes (see the guide).
   - Check existing versions first (see Publish) so you do not reuse one.

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
   - If they already approved the copy earlier in the thread, skip re-asking and publish.

4. **Publish to Supabase (required for visibility)**
   - After approval (or when the user says publish / write the update), insert or upsert a **published** row so `/updates` shows it.
   - Prefer Supabase MCP `execute_sql` on the **manhwadle** project (`snzhnkcccbxkwerbaido`) using `public.moderation_upsert_site_update` with an owner `p_actor_id` (see below).
   - Fallback: owner UI on `/updates` (Edit) or Moderation → **Updates**, only if MCP/SQL is unavailable.
   - Do **not** publish while the matching UI/code is still unreleased unless they explicitly want that announcement live early.
   - After publish, verify with `get_public_site_updates` (or a select on `site_updates`) and report the public URL (`/updates` and `/updates/<slug>`).

## Publish via Supabase MCP

Project ref: `snzhnkcccbxkwerbaido`.

### 1. Inspect current posts / versions

```sql
select id, slug, version, title, published, published_at
from public.site_updates
order by published_at desc nulls last, created_at desc
limit 20;
```

Pick the next unused semver. Do not reuse a version.

### 2. Resolve an owner actor id

```sql
select ur.user_id
from app_private.user_roles ur
where ur.role = 'owner'
limit 1;
```

If that shape differs, use whatever lookup `app_private.has_role(..., 'owner')` is backed by. Never invent a random UUID.

### 3. Create or update (published)

**New post:**

```sql
select public.moderation_upsert_site_update(
  p_actor_id := '<owner-uuid>'::uuid,
  p_id := null,
  p_title := '<title>',
  p_body := E'<lead>\n\n• <bullet>\n• <bullet>',
  p_slug := '<kebab-slug>',
  p_published := true,
  p_version := '<MAJOR.MINOR.PATCH>'
);
```

**Edit existing** (pass `p_id` from step 1):

```sql
select public.moderation_upsert_site_update(
  p_actor_id := '<owner-uuid>'::uuid,
  p_id := '<existing-id>'::uuid,
  p_title := '<title>',
  p_body := E'<body>',
  p_slug := null,
  p_published := true,
  p_version := '<MAJOR.MINOR.PATCH>'
);
```

Notes:

- `p_body` must be plain text; use `E'...'` with `\n` for newlines.
- Published posts require a valid version (`N.N.N`).
- Slugs freeze after first publish; do not try to rename a live slug.
- Escape any single quotes in title/body for SQL (`''`).

### 4. Verify public read

```sql
select public.get_public_site_updates(10, 0);
-- or
select public.get_public_site_update('<kebab-slug>');
```

Confirm `ok: true`, `published`, version, and body. Tell the user it is live on `/updates`.

## Output template (chat)

```
Version: <MAJOR.MINOR.PATCH>
Title: <theme>
Slug: <kebab-case>

Body:
<one lead sentence>

• <player-facing change>
• <player-facing change>
• <optional grouped change>
```

## Good example

```
Version: 1.1.0
Title: Easier play on phones
Slug: easier-play-on-phones

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
- Drafting in chat only and never writing to Supabase (post will not appear on the site)
- More than five bullets
- Skipping the lead sentence
- Publishing internal-only work
- Reusing an existing `version` string
