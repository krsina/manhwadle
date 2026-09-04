# Whole-Character Avatar Style Guide

**Status: STYLE A — CLASSIC SPRITE CHIBI IS CANONICAL**

This guide defines how to generate **complete, single-plate avatars** for Manhwadle. Each avatar is one finished 256×256 PNG character — not layered parts, not a customizer mannequin.

Product direction: sell / unlock **whole characters** (MapleStory-adjacent cash-shop *feel* via collecting looks), not mix-and-match clothing slots.

The older layered Style C customizer docs (`docs/avatar-art-style-guide.md`, base-anchor docs) remain historical for that experiment. **Do not** use those 11-slot / mannequin rules when generating whole-character avatars.

Canonical pixel language: **Style A — Classic Sprite Chibi**, refined from `public/avatar-style-study/elfbunny-study-a-classic.png`.

---

## Goals

- Produce readable MapleStory-adjacent **anime pixel-chibi** full-body avatars at chip (`sm` ~30px), tile (`md` ~76px), and hero (`xl` ~184px) sizes.
- Keep **one shared style recipe** so a shop of many characters feels like one art set.
- Prefer **identity-clear silhouettes** (hair, eyes, signature outfit / weapon / aura) over micro-detail.
- Stay **original designs inspired by manhwa tropes** — never copy franchise logos, official asset packs, or 1:1 trademarked costumes when shipping production IDs.

## Non-goals

- Do **not** generate swappable clothing layers or shared body plates for this product mode.
- Do **not** use Style C compact proportions (~2 heads) for whole-character avatars.
- Do **not** bake checkerboards, watermarks, UI frames, or photo backgrounds into plates.
- Do **not** use adult fashion proportions, long realistic legs, or tiny heads.

---

## Canonical recipe (Style A Classic)

| Rule | Spec |
| --- | --- |
| Proportion | **~2.5 heads tall** (head ≈ 38–42% of figure height) |
| Canvas | **256×256** px, sRGB, PNG-32 RGBA |
| Pixels | Hard square pixels; visible grid; **nearest-neighbor** only when scaling |
| Outline | Dark cool ink (`#2A2433`–`#3A2F3F`); **1–2 px** outer silhouette; interior lines thinner or equal, never heavier |
| Shading | Restrained cel: **base + 1 shade + 1 highlight** max per major material |
| Lighting | Soft key from **upper-left**; consistent across all characters |
| Face | Readable anime eyes (simpler than “expressive” Style B); limited pupil/highlight pixels; tiny or omitted nose; small mouth |
| Limbs | Short chibi arms/legs; simplified hands/feet; no detailed fingers unless essential to a held weapon |
| Pose | Prefer **front-facing idle / slight A-pose**; arms clear of torso so silhouette reads at 30px |
| Background | Fully transparent; optional **on-character** aura/particles allowed if they stay inside margins |
| Margin | ≥6 px transparent padding; no opaque pixels on canvas edges |

### Readability checks

| Size | Must pass |
| --- | --- |
| **30 px** | Head vs body separable; hair/weapon/aura silhouette still “a character,” not a smear |
| **76 px** | Eye color / signature palette readable; outfit blocks distinct from skin and hair |
| **184 px** | Hard pixel grid intact (no blur); Style A restraint obvious (not over-shaded Style D) |

---

## Character design rules (whole plate)

### Identity

Every avatar must have **at least three** strong identity signals among:

1. Hair silhouette / color  
2. Eye color / expression  
3. Signature outfit block  
4. Weapon or iconic prop  
5. Aura / elemental effect (keep compact)

### Weapons and props

- Oversized relative to the body is OK and encouraged (game-avatar readability).
- Weapons must be **clearly attached** (held, sheathed, or floating close) — not cropped off the plate.
- Prefer 1–2 hero props max; avoid clutter that fails at 30px.

### Auras

- Allowed behind or around the figure if they remain **part of the character plate**.
- Use flat cel shapes + limited particles; no soft photographic glow blooms.
- Aura must not push the figure outside the ≥6 px margin.

### Palette

- Character-specific palettes are encouraged.
- Keep ink dark and cool; avoid neon rainbow rim lights.
- Skin stays in a readable peach/tan family unless the character brief requires otherwise.
- Ensure hair, outfit, and skin separate at 76px (value contrast, not only hue).

### Originality / franchise

- References may guide **tropes** (shadow hunter, martial monkey king, etc.).
- Production filenames and shop copy should use **original names** (e.g. Shadow Regressor, Skybreaker Monk) unless explicitly approved otherwise.
- Do not reproduce official logos, exact UI chrome, or copyrighted marks.

---

## Export contract

1. Exactly **256×256** RGBA PNG.  
2. Transparent background; clean edges (no white/black matte fringe).  
3. No text, watermark, signature, or checkerboard.  
4. Full body visible; feet near bottom third; head in upper third.  
5. Store production candidates under:

```text
public/avatar-characters/
  style-a/
    <slug>.png
    review/
      comparison.png
      size-check.png
```

---

## Reusable generation prompt

### Base (append every character)

```text
Original MapleStory-adjacent anime pixel-chibi avatar, Style A classic sprite:
about 2.5 heads tall, crisp hard square pixels, visible pixel grid, 1-2px dark
cool outline, restrained cel shading (one shade + one highlight per material),
readable anime eyes, short chibi limbs, front-facing idle / slight A-pose,
full body centered on transparent background, 256x256, generous margin,
upper-left light, clean silhouette, no text, no watermark, no blur, no 3D,
no realistic anatomy, no adult fashion proportions.
```

### Negative prompt

```text
layered clothing mannequin, Style C compact 2-head proportions, soft painterly
brush, continuous gradient shading, photographic blur, motion blur, watermark,
logo, signature, text, checkerboard background, opaque white/black matte,
UI frame, collage, multiple characters, cropped feet, cropped weapons,
tiny head, long realistic legs, smooth vector curves without pixel grid
```

### Chroma workflow (recommended)

Generate on flat `#FF00FF` magenta, then chroma-key + nearest-neighbor resize to 256×256 (same pipeline as `scripts/process-avatar-style-study.ps1`).

---

## Starter defaults (intentionally plain)

Free starters should follow Style A technique but look **visually boring** next to unlockable heroes — muted palette, no weapons, no aura, no fancy hair.

### Default female

| Trait | Spec |
| --- | --- |
| Hair | Short neat brown bob |
| Eyes | Plain brown (not glowing) |
| Outfit | Light-gray tee + dark-gray shorts |
| Shoes | Basic brown slip-ons |
| Props / aura | **None** |

**Output:** `public/avatar-characters/style-a/default-female.png`

### Default male

| Trait | Spec |
| --- | --- |
| Hair | Short neat black crop |
| Eyes | Plain dark brown (not glowing) |
| Outfit | Light-gray tee + dark-gray pants |
| Shoes | Basic brown slip-ons |
| Props / aura | **None** |

**Output:** `public/avatar-characters/style-a/default-male.png`

### Plainness rules (defaults only)

- Mute saturation; avoid signature accent colors.
- Simpler eye detail than premium characters.
- No glow, particles, dual-wield props, or elaborate silhouettes.
- Still pass Style A proportion / pixel / outline rules so the shop set feels cohesive.

---

## Test characters (style-guide validation)

Use these briefs to iterate the guide. They are **inspired-by** tropes, not official recreations.

### Shadow hunter (Solo Leveling–inspired)

| Trait | Spec |
| --- | --- |
| Hair | Messy / spiky black with cool grey highlights |
| Eyes | Glowing cyan / electric blue |
| Outfit | Black open trench / high collar, dark shirt, dark pants, boots |
| Props | **Dual daggers** — one in each hand or clearly paired; oversized for readability |
| Aura | Compact jagged purple-black shadow aura behind the figure |
| Pose | Front idle, arms slightly out holding blades |

**Output:** `public/avatar-characters/style-a/shadow-hunter.png` (generated 2026-07-18). Dual daggers present; aura readable at 76px; coat silhouette can make the figure read slightly shorter than 2.5 heads — acceptable if head mass stays dominant.

### Skybreaker monk (God of High School–inspired)

| Trait | Spec |
| --- | --- |
| Hair | Voluminous spiky brown |
| Headwear | White swirling forehead circlet / binding loop |
| Eyes | Large simplified anime eyes (may be pale/white-iris “power” stare) |
| Outfit | Open dark cropped vest with gold trim, exposed midriff, blue baggy pants |
| Waist | Tiger-pattern cloth + red sash |
| Arms | Brown wrist guards; optional prayer beads on one wrist |
| Pose | Front idle, ready stance without extreme action foreshortening |

**Output:** `public/avatar-characters/style-a/skybreaker-monk.png` (generated 2026-07-18). Circlet, tiger wrap, red sash, and beads all readable at 76px; strongest Style A match of the first pair.

### Lessons locked into the recipe (after first pair)

1. **Call out missing props explicitly** in the prompt (“MUST hold TWO daggers”) — optional wording drops them.
2. **Auras must stay behind the silhouette** and leave ≥6 px margin; prefer jagged cel shapes over soft glow.
3. **Dark coats + dark auras** need a bright eye accent (cyan) or the plate muddies at 30px.
4. **Signature color blocks** (red sash, gold trim, tiger cloth) beat micro-folds for identity.
5. Prefer original shop slugs (`shadow-hunter`, `skybreaker-monk`) even when references are franchise-inspired.

Review sheets: `public/avatar-characters/style-a/review/comparison.png`, `…/size-check.png`. Processor: `scripts/process-whole-character-style-a.ps1`.

---

## Selection / QA rubric

Score 1–5:

1. Style A fidelity (2.5 heads, hard pixels, restrained shading)  
2. Identity clarity at 30px  
3. Palette separation at 76px  
4. Prop / aura readability without clutter  
5. Shop readiness (transparent, margins, no text)

Fail and regenerate if: wrong head ratio, blurry AA, missing signature props, franchise watermark, or opaque background.

---

## Related paths

| Path | Role |
| --- | --- |
| `public/avatar-style-study/elfbunny-study-a-classic.png` | Style A fidelity reference |
| `docs/avatar-art-style-guide.md` | Historical layered Style C experiment |
| `public/avatar-characters/style-a/` | Whole-character generation outputs |
| `docs/avatar-character-roster-wave1.md` | Wave-1 character briefs + shop copy |
| `scripts/avatar-roster/wave-1.json` | Machine-readable wave-1 roster |
| `scripts/avatar-roster/wave-popular-50.json` | Machine-readable popular-wave 50 roster |
| `scripts/process-whole-character-style-a.ps1` | Chroma key + review sheets (discovers `*-style-a-chroma.png`) |
| `docs/avatar-stage-background-style-guide.md` | Style A scenic stage backdrops |
| `public/avatar-stages/style-a/` | Stage plates behind home / shop avatars |

**Shop wiring (done):** Style A whole characters are live in the catalog via migration `20260718140000_whole_character_avatar_shop.sql` plus wave-1 expansion `20260719100000_avatar_wave1_shop.sql`. Catalog / asset ids include starters, Shadow Hunter, Skybreaker Monk, and the twelve wave-1 originals (see [avatar-character-roster-wave1.md](./avatar-character-roster-wave1.md)). Client shop + `PixelAvatar` equip via `equipped_avatar_id` (no layered customizer).

---

## Wave-1 batch workflow

1. Edit briefs in `scripts/avatar-roster/wave-1.json` / `docs/avatar-character-roster-wave1.md`.
2. Generate chroma plates with **Cursor Grok 4.5** `GenerateImage`, Style A refs (`elfbunny-study-a-classic.png`, `shadow-hunter.png`, `skybreaker-monk.png`), flat `#FF00FF` background → `tmp/avatar-chroma/<slug>-style-a-chroma.png`.
3. Process: `scripts/process-whole-character-style-a.ps1 -SourceDirectory tmp/avatar-chroma -OutputDirectory public/avatar-characters/style-a` (discovers `*-style-a-chroma.png`).
4. Fringe clean: `scripts/clean-style-a-magenta-fringe.ps1`.
5. Rebuild review sheets after clean: `…process-whole-character-style-a.ps1 -OutputDirectory public/avatar-characters/style-a -ReviewOnly`.
6. Register in `AVATAR_CHARACTER_META` + additive `shop_items` migration (never re-run the old “deactivate not in whitelist” cut).
