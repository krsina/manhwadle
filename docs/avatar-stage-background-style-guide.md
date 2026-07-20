# Avatar Stage Background Style Guide

**Status: STYLE A — CLASSIC PIXEL SCENERY IS CANONICAL**

This guide defines how to generate **scene backdrop plates** for Manhwadle avatar wells. Each stage is one finished scenic PNG that sits **behind** transparent Style A whole-character avatars — never baked into the character plate.

Product direction: MapleStory-adjacent **cash-shop stage** feel (soft scenic depth behind a chibi sprite), with original **manhwa-fantasy** moods.

Character rules stay in [`whole-character-avatar-style-guide.md`](./whole-character-avatar-style-guide.md). Stages must match that pixel language (hard pixels, restrained cel shading, upper-left light) without stealing silhouette contrast from the avatar.

Canonical pairing: Style A characters on Style A stages under `public/avatar-stages/style-a/`.

---

## Goals

- Produce readable MapleStory-adjacent **pixel scenery** behind chip (~76px), panel (~112px), and hero (~216px) avatar wells.
- Keep **one shared style recipe** so home, shop preview, and shop cards feel like one art set.
- Prefer **clear ground plane + sky depth** so chibi feet read as “standing in a place.”
- Stay **original designs inspired by manhwa tropes** — never copy franchise maps, logos, UI chrome, or official MapleStory tilesets.

## Non-goals

- Do **not** put characters, NPCs, or readable faces on the stage plate.
- Do **not** bake checkerboards, watermarks, text, or shop UI frames into plates.
- Do **not** use photographic landscapes, soft painterly blur, or 3D renders.
- Do **not** use neon cyberpunk cityscapes that fight the Style A ink/palette language.

---

## Canonical recipe (Style A Classic Stage)

| Rule | Spec |
| --- | --- |
| Canvas | **512×384** px (4:3), sRGB, PNG-24/32 opaque |
| Pixels | Hard square pixels; visible grid; **nearest-neighbor** only when scaling |
| Outline | Soft scenic edges; major silhouettes (trees, roofs, rocks) use dark cool ink (`#2A2433`–`#3A2F3F`) at 1 px where needed |
| Shading | Restrained cel: **base + 1 shade + 1 highlight** max per major material |
| Lighting | Soft key from **upper-left**; match Style A avatars |
| Composition | Clear **ground plane in lower third**; horizon / mid-depth in middle; sky or canopy in upper third |
| Depth | 2–3 simple parallax bands (far / mid / near ground) — no busy clutter |
| Vignette | Soft darkening toward edges / bottom so the centered chibi pops |
| Color | Manhwa-fantasy palettes (blossom pinks, meadow greens, dusk purples) with cool ink; avoid neon rainbow rims |
| Characters | **None** — empty stage only |

### Readability checks

| Context | Must pass |
| --- | --- |
| **Shop card** (~76–120 px tall crop) | Still reads as “a place” (sky vs ground separable); not a muddy smear |
| **Home panel** (~112 px) | Ground plane obvious; palette distinct from typical character outfits |
| **Shop preview** (~216 px) | Hard pixel grid intact; Style A restraint obvious (not over-shaded photo paint) |

---

## Scene design rules

### Ground plane

- Lower third should feel walkable (stone path, grass, wood deck, plaza tiles).
- Keep the center-bottom relatively clear of tall props so feet are not visually swallowed.
- Soft bottom gradient / shadow band is encouraged (helps CSS scrim + sprite legibility).

### Mid / far scenery

- Prefer large readable blocks: trees, rooftops, cliffs, lantern posts, blossom canopies.
- Avoid tiny unreadable windows/text on buildings.
- Horizon should sit roughly mid-frame so `background-position: center bottom` crops gracefully.

### Atmosphere

- Optional: petals, fireflies, soft clouds, distant mountains — keep sparse.
- No weather overlays that obscure the center (heavy fog, full-screen rain sheets).

### Originality

- References may guide **tropes** (murim courtyard, pastoral meadow, dusk plaza).
- Production filenames and copy use original names (`blossom-courtyard`, `sky-meadow`, `dusk-plaza`).
- Do not reproduce official MapleStory maps, logos, or copyrighted landmarks.

---

## Export contract

1. Exactly **512×384** opaque PNG (or nearest-neighbor resized to that).
2. No transparency required (opaque scenic plate).
3. No text, watermark, signature, checkerboard, or UI chrome.
4. No characters / creatures with readable faces.
5. Store production candidates under:

```text
public/avatar-stages/style-a/
  <slug>.png
  review/
    comparison.png
    size-check.png
```

Default wired in shop / homepage: `blossom-courtyard.png` as free shop item `stage_blossom_courtyard`.

---

## Reusable generation prompt

### Base (append every stage)

```text
Original MapleStory-adjacent anime pixel-art scenic stage backdrop, Style A classic:
hard square pixels, visible pixel grid, restrained cel shading (one shade + one
highlight per material), soft upper-left light, empty scene with NO characters,
clear ground plane in the lower third, mid-depth scenery, sky or canopy above,
soft edge vignette so a centered chibi sprite would pop, 512x384 landscape,
no text, no watermark, no blur, no 3D, no photo realism, no UI frames.
```

### Negative prompt

```text
characters, people, chibi avatar, NPC, face, watermark, logo, signature, text,
UI frame, HUD, checkerboard, photographic blur, soft painterly brush,
continuous gradient mush, neon cyberpunk, MapleStory logo, franchise map copy,
busy clutter that muddies the center, cropped ground plane
```

### Aspect

Generate landscape / 4:3 (or closest). Resize with nearest-neighbor to **512×384** if needed.

---

## Starter scenes (wave-1 stages)

### Blossom courtyard (default)

| Trait | Spec |
| --- | --- |
| Mood | Murim / manhwa courtyard at soft daylight |
| Ground | Pale stone path or wooden deck, center clear |
| Mid | Blossom trees, simple tiled roof eaves, lantern post |
| Sky | Soft blue with light pink petal drift |
| Palette | Cream stone, pink blossoms, muted teal roof accents |
| Output | `public/avatar-stages/style-a/blossom-courtyard.png` |

### Sky meadow (alt)

| Trait | Spec |
| --- | --- |
| Mood | Pastoral high-fantasy meadow |
| Ground | Soft green grass with a faint dirt path center |
| Mid | Rolling hills, a few distant trees |
| Sky | Bright blue with simple white pixel clouds |
| Palette | Greens, warm dirt, sky blue |
| Output | `public/avatar-stages/style-a/sky-meadow.png` |

### Dusk plaza (alt)

| Trait | Spec |
| --- | --- |
| Mood | Quiet dusk town plaza |
| Ground | Cobble plaza tiles, center clear |
| Mid | Simple shop fronts / awnings, warm window glow |
| Sky | Purple-orange dusk gradient with soft stars optional |
| Palette | Cool purple dusk, warm amber windows |
| Output | `public/avatar-stages/style-a/dusk-plaza.png` |

---

## Selection / QA rubric

Score 1–5:

1. Style A fidelity (hard pixels, restrained shading, upper-left light)
2. Ground-plane clarity for chibi feet
3. Center readability (not cluttered)
4. Palette separation from typical dark/light avatars
5. Shop readiness (correct size, no text/characters)

Fail and regenerate if: characters present, blurry AA, franchise marks, missing ground plane, or center too busy.

---

## UI wiring contract

Stages are **purchasable shop items** (`item_type = avatar_stage`).

| Surface | Behavior |
| --- | --- |
| Homepage `.character-panel-avatar` | Shows the player's **equipped** stage behind their avatar |
| Shop large preview | Characters tab: selected character on equipped stage. Backgrounds tab: equipped avatar on **selected / previewed** stage |
| Shop character cards | **No** stage backdrop |
| Shop background cards | Stage thumbnail only (no character plate) |

CSS class `.avatar-stage-well` provides scrim + pixel rendering; set `--avatar-stage-url` via `avatarStageCssUrl(...)` from [`src/lib/avatarStages.ts`](../src/lib/avatarStages.ts).

---

## Related paths

| Path | Role |
| --- | --- |
| `docs/whole-character-avatar-style-guide.md` | Style A character plates |
| `public/avatar-style-study/elfbunny-study-a-classic.png` | Shared pixel-language reference |
| `public/avatar-stages/style-a/` | Stage generation outputs |
| `src/lib/avatarStages.ts` | Stage URL constants |
| `scripts/process-avatar-stages-style-a.ps1` | Resize + review sheets |
