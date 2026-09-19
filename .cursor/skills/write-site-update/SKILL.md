---
name: write-site-update
description: >-
  Drafts and publishes Manhwadle public News posts to Supabase so they appear
  on /news, using Brief house style for release updates (kind, version, title,
  lead, bullets) or a shorter announcement shape. Use when the user asks to
  write an update, changelog, site update, news post, announcement, patch
  notes for players, publish to News/Updates, or post something to the News
  page.
---

# Write a site update

Draft player-facing **News** posts (`/news`; legacy `/updates` redirects) in
Manhwadle’s house style, then **write them to Supabase** so they are visible
on the live site.

## Required reading

Before drafting, read and follow:

`docs/updates-style-guide.md` (repo root)

That guide is canonical. Do not invent alternate formats (no bullets-only
release notes, no single-paragraph-only release updates) unless the user
explicitly overrides for one post.

Hard rules from the guide:

- Choose a **kind**: `update` (Release update) or `announcement`.
- Release updates always include a **version** (`MAJOR.MINOR.PATCH`).
- Announcements may omit version.
- Never use em dashes (`—`).
- Do not put version, date, or kind label in the title.
- Keep **Latest published version** + examples in the guide and this skill in
  sync after every versioned release publish.

## Version sync (required)

The guide’s **Latest published version** line is the human-facing stamp of
what is live for **release updates**.

1. **Before drafting:** read that line and/or query `site_updates` versions.
   Next version must be newer and unused.
2. **After publishing a versioned release update to Supabase:** in the **same
   follow-up commit/PR** (or immediately in-repo if already shipping docs),
   update:
   - `docs/updates-style-guide.md` → **Latest published version**
   - `docs/updates-style-guide.md` → **Example (preferred)** (kind, version,
     title, body of the post just shipped)
   - This file → **Good example** (same kind / version / title / slug / body)
3. Never leave guide or skill examples on an older version after a successful
   versioned publish. Pure announcements without a version do not move the
   stamp.

## Workflow

Treat “write an update” / `/write-site-update` as **draft → approve → publish
to Supabase → sync guide + skill versions**, unless the user asks for a draft
only.

1. **Gather what shipped**
   - Prefer `git status` / `git diff` / recent commits against the tracking
     branch (and merged PRs if that is the ship).
   - Translate changes into **player outcomes**. Drop migrations, tests,
     refactors, and tooling unless they change something visible.
   - Skip owner-only / local-dev surfaces (for example bust-crop editors).
   - Choose **kind** (`update` vs `announcement`) and, for release updates, a
     version bump from the guide (MINOR vs PATCH). Manhwadle is on public `1.x`.
   - Check **Latest published version** + live DB so you do not reuse a version.

2. **Draft in Brief form**
   - Kind required.
   - Version required for `update`; optional for `announcement`.
   - Title ≤ ~60 chars, thematic.
   - One lead sentence.
   - Blank line.
   - For release updates: 2–5 bullets, each starting with `• `.
   - ~40–90 words total for release updates.
   - Plain text only. No em dashes.

3. **Present for approval**
   - Show **Kind**, **Version** (or “none” for announcements), **Title**,
     **Body**, and a suggested **slug** (kebab-case from the title).
   - Unless the user already chose a draft, offer the Brief version as the only
     default for release updates.
   - If they already approved the copy earlier in the thread, skip re-asking
     and publish.

4. **Publish to Supabase (required for visibility)**
   - After approval (or when the user says publish / write the update), insert
     or upsert a **published** row so `/news` shows it.
   - Prefer Supabase MCP `execute_sql` on the **manhwadle** project
     (`snzhnkcccbxkwerbaido`) using `public.moderation_upsert_site_update`
     with an owner `p_actor_id` (see below). Pass `p_kind`.
   - Fallback: owner UI on `/news` (Edit) or Moderation → **News**, only if
     MCP/SQL is unavailable.
   - Do **not** publish while the matching UI/code is still unreleased unless
     they explicitly want that announcement live early.
   - After publish, verify with `get_public_site_updates` (or a select on
     `site_updates`) and report the public URL (`/news` and `/news/<slug>`).

5. **Sync docs (required after a versioned release publish)**
   - Update guide + this skill examples to the new version (see **Version sync**).
   - Ship those doc/skill edits through the normal `/git-pr-flow` unless the
     user forbids a PR.

## Publish via Supabase MCP

Project ref: `snzhnkcccbxkwerbaido`.

### 1. Inspect current posts / versions

```sql
select id, slug, version, title, kind, published, published_at
from public.site_updates
order by published_at desc nulls last, created_at desc
limit 20;
```

Cross-check against **Latest published version** in the style guide. Pick the
next unused semver for release updates.

### 2. Resolve an owner actor id

```sql
select ur.user_id
from app_private.user_roles ur
where ur.role = 'owner'
limit 1;
```

Never invent a random UUID.

### 3. Create or update (published)

**New release update:**

```sql
select public.moderation_upsert_site_update(
  p_actor_id := '<owner-uuid>'::uuid,
  p_id := null,
  p_title := '<title>',
  p_body := E'<lead>\n\n• <bullet>\n• <bullet>',
  p_slug := '<kebab-slug>',
  p_published := true,
  p_version := '<MAJOR.MINOR.PATCH>',
  p_kind := 'update'
);
```

**New announcement:**

```sql
select public.moderation_upsert_site_update(
  p_actor_id := '<owner-uuid>'::uuid,
  p_id := null,
  p_title := '<title>',
  p_body := E'<lead>\n\nOptional second paragraph.',
  p_slug := '<kebab-slug>',
  p_published := true,
  p_version := null,
  p_kind := 'announcement'
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
  p_version := '<MAJOR.MINOR.PATCH or null>',
  p_kind := 'update'
);
```

Notes:

- `p_body` must be plain text; use `E'...'` with `\n` for newlines.
- Published `update` posts require a valid version (`N.N.N`).
- Slugs freeze after first publish; do not try to rename a live slug.
- Escape any single quotes in title/body for SQL (`''`).
- Always pass `p_kind` explicitly (`update` or `announcement`).

### 4. Verify public read

```sql
select public.get_public_site_updates(10, 0);
-- or
select public.get_public_site_update('<kebab-slug>');
```

Confirm `ok: true`, `published`, `kind`, version (when set), and body. Tell
the user it is live on `/news`.

### 5. Sync guide + skill

Update both files to the post you just published (when it is a versioned
release update), then open/merge a PR via `/git-pr-flow`.

## Output template (chat)

```
Kind: <update|announcement>
Version: <MAJOR.MINOR.PATCH or none>
Title: <theme>
Slug: <kebab-case>

Body:
<one lead sentence>

• <player-facing change>
• <player-facing change>
• <optional grouped change>
```

## Good example

Matches **Latest published version** in `docs/updates-style-guide.md`:

```
Kind: update
Version: 1.3.0
Title: First try, then the next mode
Slug: first-try-then-the-next-mode

Body:
First-try celebrations stay smooth on phones, and the result screen now points you to another daily.

• First-try wins use a lighter confetti burst on phones so you can still tap Share and keep playing.
• Double solves keep the gold flash without stacking extra fireworks on top.
• After you finish, chips and a Play button send you to the next mode you have not done today.
• If you already cleared the set, Play Versus is right there.
```

## Anti-patterns

- Em dashes
- Git-log tone (“refactored KnownInfoPanel”, “added RLS policies”)
- Vague hype (“huge improvements”, “exciting update”)
- Missing kind, or kind stuffed into the title
- Missing version on a release update, or version stuffed into the title
- Drafting in chat only and never writing to Supabase
- Publishing without updating guide + skill version examples (versioned posts)
- More than five bullets
- Skipping the lead sentence on release updates
- Publishing internal-only or local-dev-only work
- Reusing an existing `version` string
- Leaving examples on `0.x` now that the public product is on `1.x`
- Pointing players at `/updates` as the canonical URL (use `/news`)
