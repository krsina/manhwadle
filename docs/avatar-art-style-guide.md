# Avatar Art Style Guide

**Status: SUPERSEDED for new product work.** Style C layered customizer is historical only. Do not generate new shop art or ship product features from this guide.

**Canonical guide for the live shop:** [`docs/whole-character-avatar-style-guide.md`](whole-character-avatar-style-guide.md) (**Style A — Classic Sprite Chibi**). Shop cut over to whole-character Style A via migration `20260718140000_whole_character_avatar_shop.sql` (`equipped_avatar_id`; catalog ids `avatar_default_female`, `avatar_default_male`, `avatar_shadow_hunter`, `avatar_skybreaker_monk`).

This document remains the record of the Style C layered customizer experiment and study variants A–D. Four controlled variants of one study subject isolate *art style and proportion only*. They are references for choosing a rendering direction, **not selectable complete characters**. Each study image bakes together mint hair, bunny hood, face, skin, and outfit, so **none of A–D is directly usable as a production whole-character plate**.

**Historical product goal (no longer shipping):** a MapleStory-cash-shop-like **layered** character customizer that composites independently equipped PNG parts over approved body plates. Variant C defined that experiment’s art direction. Neutral modest female and male mannequins were approved on **2026-07-18** under a shared attachment contract. Migration `20260718130000_style_c_expanded_avatar_slots.sql` encoded the **11-slot** loadout model; that path is superseded by the whole-character cutover above.

Variant C's recipe below applies only if revisiting the layered experiment. Variants A, B, and D remain as historical study alternatives and must not be mixed into Style A whole-character assets.

---

## Goals

- Establish a **MapleStory-adjacent anime pixel-chibi** direction that reads clearly at UI chip, shop tile, and hero preview sizes.
- Keep character identity, pose, framing, and palette **fixed** across variants so style differences are comparable.
- Produce rules and prompts that a future artist or generator can reuse without guessing.
- Ship a cash-shop customizer that composites equipped assets from the **11-slot** loadout: `body`, `skin`, `face`, `ears`, `hair`, `headwear`, `top`, `bottom`, `shoes`, `accessory`, `weapon`.
- Keep Style C starter item IDs, ownership/entitlements, prices, and loadout persistence aligned between client catalog (`src/lib/avatarComposition.ts`), production manifest (`public/avatar/style-c/manifest.json`), and the Style C migration.

## Non-goals

- Do **not** copy MapleStory (or any franchise) characters, outfits, logos, UI chrome, or asset packs. Adjacent feel only.
- Do **not** treat historical study plates A–D as production layered parts.
- Do **not** generate the full shop catalog during the study phase.
- Do **not** invent a second study character or alternate outfits/poses for A–D; one subject, four styles.
- Do **not** ship A–D as complete selectable avatars or treat their flattened pixels as production-ready layered parts.
- Do **not** use the green-haired, hooded, dressed study character as the female base. A production body plate must not bake in hair, headwear, outfit fashion, shoes, accessory, or weapon.

---

## Study subject (fixed identity)

Original character brief (not a franchise recreation):

| Trait | Spec |
| --- | --- |
| Hair | Mint-green, very long, flowing past the hips; soft bangs that frame the face |
| Ears | Long pointed elf ears, clearly visible beside/under the hood |
| Hood | White plush bunny hood with two tall lime-green ears (hood sits on the head; ears read as soft fabric, not rigid spikes) |
| Eyes | Heterochromia: **left** eye green, **right** eye warm red/orange; large chibi anime eyes |
| Outfit | Pale-blue fantasy two-piece (crop/top + bottoms); clean silhouette, no busy logos |
| Pose | Front-facing, neutral standing pose, arms relaxed at sides or lightly away from body |
| Expression | Soft neutral / slight calm; no extreme mouth shapes |
| Framing | Full body centered; head near top third; feet near bottom; small ground clearance; no props beyond the outfit/hood |

---

## Historical study constants

These constants were held identical across variants **A–D** so the completed study isolated style. They describe the study plates, not production slot assets.

| Constant | Value |
| --- | --- |
| Subject | Green-haired elf/bunny study character above |
| View | Orthographic front 3/4–front; prefer true front; no profile |
| Camera | Eye-level; no dramatic foreshortening |
| Background | Fully transparent (alpha 0); no drop shadow baked into the plate for study exports (optional soft ground contact is allowed only if identical across all four and still transparent outside the character) |
| Master canvas | **256×256** px PNG, sRGB, 8-bit RGBA |
| Character bbox | Vertically fill ~88–94% of canvas height; horizontally centered; leave ≥6 px margin on all sides |
| Palette family | Mint hair `#7DDBB0`–`#3FAF7A`; lime hood ears `#B8F06A`–`#7BC82E`; white hood `#F7F9FC`–`#D7DDE8`; pale-blue outfit `#B8D4F0`–`#6F98C8`; skin light peach `#F3C9B0`–`#E8A888`; left iris green `#3CB86A`; right iris warm `#E35A3A`–`#F07840`; line/ink dark cool brown-purple `#3A2F3F` (exact hex may vary ±1 step on a 32-color quantized grid if the variant demands it, but hue families must match) |
| Lighting | Soft key from upper-left; single light direction across all variants |
| Export name stem | `elfbunny-study` (see [File naming](#file-naming)) |

**App display targets** (approximate CSS rem sizes at 16px root; use these for readability checks):

| Token | Approx. display | Typical surface |
| --- | --- | --- |
| `sm` | **~30 px** | Auth/header bust chip |
| `md` | **~76 px** | Shop tiles / list previews |
| `xl` | **~184 px** | Shop hero / purchase modal |

Master art is authored at 256×256; evaluate downscales with nearest-neighbor *and* with the app’s `image-rendering: pixelated` / `crisp-edges` display filter.

---

## Variant study record

**C is canonical. A, B, and D are historical alternatives only; their conflicting proportions, line, eye-detail, and shading rules are not active production guidance.**

### A — Classic Sprite Chibi (historical alternative)

- **Proportion:** ~**2.5 heads** tall (head height ≈ 40% of total figure height).
- **Pixels:** Crisp hard pixels; visible grid; prefer 1–2 px outline.
- **Shading:** Restrained cel shading — base + 1 shade + 1 highlight max per major material.
- **Face:** Readable anime eyes, but smaller/simpler than B; pupils and highlights limited to a few pixels.
- **Hair/hood:** Clear stepped silhouette; avoid soft blobs.
- **Best for:** Authentic sprite nostalgia and cheap future sheet animation.

### B — Expressive Anime Chibi (historical alternative)

- **Proportion:** Still chibi (~2.3–2.6 heads), but head and hair mass feel larger.
- **Pixels:** Softer pixel *clusters* (small AA-like groups still on-grid); less “LEGO brick” than A.
- **Eyes:** Larger, more detailed (iris rings, dual highlights); heterochromia must remain obvious at 76 px.
- **Hair:** Fuller silhouette, more strand groups and volume around the bunny hood.
- **Shading:** 2–3 value steps on hair and outfit; still cel-like, not painted.
- **Best for:** Character appeal and manhwa-adjacent cuteness.

### C — Compact Game Chibi (canonical)

- **Proportion:** ~**2 heads** tall (strongest head/body exaggeration).
- **Outline:** Boldest of the set (often 2 px dark outline on outer silhouette).
- **Detail:** Reduce micro-detail; enlarge eyes, hood ears, and outfit color blocks.
- **Readability:** Optimized so face + hood ears remain identifiable at **30 px**.
- **Shading:** Minimal — often flat fills + one shade.
- **Best for:** Tiny UI chips and dense leaderboards.

### D — Polished Pixel Chibi (historical alternative)

- **Proportion:** ~2.4–2.6 heads (between A and B).
- **Grid:** Strict pixel grid — no painterly blur, no continuous-tone brushes.
- **Detail:** Richest highlights on hair strands, fabric folds, and plush hood; still quantized.
- **Line:** Thin clean outline (1 px) with selective inner lines.
- **Shading:** More bands than A, but every edge snaps to pixels.
- **Best for:** Premium shop hero look without leaving pixel art.

---

## Silhouette, proportion, face, palette, line, shading rules

### Silhouette

- Outer contour must read as: tall bunny ears → round hooded head → slim torso → short legs.
- Mint hair must spill below the waist on both sides; do not crop hair into a bob.
- Elf ears must pierce or sit clearly outside the hood mass.
- No crossed arms, seated pose, or weapon in the study plate (weapons belong to the optional `weapon` slot).

### Proportion

| Variant | Heads tall | Head share of height | Notes |
| --- | --- | --- | --- |
| A | 2.5 | ~40% | Classic sprite |
| B | ~2.4 | ~42% | Extra hair volume |
| C | ~2.0 | ~50% | Compact game |
| D | ~2.5 | ~40–42% | Same massing as A, richer interior |

Limb thickness stays chibi-short; legs never exceed ~one head length for A/B/D; C may go shorter.

### Face

- Centered on the head; eyes below the horizontal midline of the head circle.
- Left iris green, right iris warm red/orange — never swap.
- Nose is a tiny mark or omitted; mouth is a small neutral curve.
- No adult fashion-proportion face; keep eye spacing wide.

### Palette

- Stay within the shared palette families in [Historical study constants](#historical-study-constants).
- Do not introduce saturated purple neon, gold armor, or unrelated accent colors in the study.
- White hood must stay cooler/whiter than skin; lime ears must stay yellower/greener than mint hair so both greens separate at 76 px.

### Line

- Outer silhouette ink darker than interior separators.
- Interior lines thinner or same weight, never heavier than the outer line.
- Variant C may thicken the outer line; A/D prefer 1 px; B may use soft clustered edges instead of a continuous thick stroke.

### Shading

- Light from upper-left for all variants.
- No rim-light rainbows, no bloom, no photographic softbox gradients.
- Cast shadows under the chin/hood only; keep them on-model, not baked full-canvas drops.

---

## Canvas, transparency, and export requirements

1. **Size:** Exactly **256×256** pixels for each standalone variant PNG.
2. **Color:** sRGB, PNG-24/32 with alpha.
3. **Transparency:** Background pixels fully transparent. No checkerboard baked in. No matte fringe (halo) of white/black around the character — premultiply-clean edges.
4. **Padding:** ≥6 px transparent margin; do not touch canvas edges with opaque pixels.
5. **Comparison sheet:** One labeled board showing A–D at equal scale (may be larger than 256 on the long edge). Labels: `A Classic`, `B Expressive`, `C Compact`, `D Polished`. Sheet may use a neutral solid or transparent background; if solid, use flat `#1A1A1E` or `#F4F4F5` only — never a photo backdrop.
6. **No text on standalone plates** except the comparison sheet labels.
7. **No watermark, logo, or signature.**

Study outputs generated on **2026-07-18** live under `public/avatar-style-study/`:

```text
public/avatar-style-study/
  elfbunny-study-a-classic.png
  elfbunny-study-b-expressive.png
  elfbunny-study-c-compact.png
  elfbunny-study-d-polished.png
  elfbunny-study-comparison.png
  elfbunny-study-size-check.png
```

The standalone plates are verified 256×256 RGBA PNGs with transparent corners. The comparison and actual-size readability sheets use the approved dark neutral review background. If an image generator returns an opaque chroma plate, run `scripts/process-avatar-style-study.ps1` to remove the magenta key, resize with nearest-neighbor sampling, and rebuild both review sheets.

---

## Readability checks (30 / 76 / 184 px)

Before requesting user selection, downscale each standalone PNG to **30**, **76**, and **184** CSS pixels (and/or view in-app at `sm` / `md` / `xl`).

| Size | Must pass |
| --- | --- |
| **30 px** | Bunny-ear silhouette recognizable; head vs body separable; not a green smear. Variant **C** is the readability bar — A/B/D should still be “a cute hooded character,” even if eye colors merge. |
| **76 px** | Heterochromia readable (green vs warm eye); mint hair vs lime ears separable; pale-blue outfit vs skin separable. |
| **184 px** | Style differences between A–D obvious; fabric/hair detail on D visible; hard-pixel grid on A/D intact (no accidental blur). |

Fail the asset if: muddy outline, opaque background, cropped ears/hair, swapped eye colors, or adult body proportions.

---

## Production 11-slot contract (implemented)

Study plates are **flat composites used only to compare style and proportion**. Their baked hair, hood, face, skin, and clothing overlap across slots, so cutting the plates apart will not produce clean production assets.

### Approved bases + first elf set

Female and male peach body plates were approved on **2026-07-18** with identical attachment anchors (`docs/avatar-base-anchors.md`, `docs/avatar-male-base-anchors.md`). Production Style C art and the first elf starter set live under:

```text
public/avatar/style-c/
  manifest.json
  bodies/
  face/
  ears/
  hair/
  headwear/
  top/
  bottom/
  shoes/
  review/
```

Machine-readable pack: `public/avatar/style-c/manifest.json` (`style-c-elf-pack`). Client resolver: `src/lib/avatarAssets.ts`. Compositor: `src/components/PixelAvatar.tsx` (stacked `<img>` PNGs, nearest-neighbor CSS — **not** SVG).

| Slot | Required? | Contents | Layer notes |
| --- | --- | --- | --- |
| `body` | yes | Female/male peach body plate | Shared anchors; baked modest underlayer + peach skin silhouette |
| `skin` | yes | Skin tone id (e.g. `skin_peach`) | Catalog/economy slot; tone is baked into matching body plates for the starter set |
| `face` | yes | Eyes, brows, mouth | Transparent except facial features; align to fixed face bounds |
| `ears` | optional | Elf / pointed ear tips | Separate plate over body ears; may be unequipped |
| `hair` | yes | Separate **hair back** and **hair front** plates | Back behind body; front over forehead / selected clothing edges |
| `headwear` | optional | Hoods/hats with back/front when needed | Bunny hood is the starter; not an accessory |
| `top` | yes | Shirts, wraps, coats' upper portions | Cover agreed torso/arm seams |
| `bottom` | yes | Pants, skirts, shorts | Shared waist/hip seams with `top` |
| `shoes` | yes | Footwear (or transparent bare plate) | Align to ankle / sole / ground baseline |
| `accessory` | optional | Glasses, auras, etc. | Split back/front when wrapping the body; empty in first elf set |
| `weapon` | optional | Handheld weapons | Back/front split by grip occlusion; empty in first elf set |

**First elf starter IDs** (client + migration + manifest):

| ID | Slot |
| --- | --- |
| `body_female_peach` | body |
| `body_male_peach` | body |
| `skin_peach` | skin |
| `face_elf_heterochromia` | face |
| `ears_elf_pointed` | ears |
| `hair_mint_long` | hair |
| `headwear_bunny_hood` | headwear |
| `top_sky_wrap` | top |
| `bottom_sky_shorts` | bottom |
| `shoes_bare` | shoes |

Default loadout: female peach body + peach skin + heterochromia face + pointed ears + mint long hair + bunny hood + sky wrap/shorts + bare shoes; `accessory` / `weapon` null.

**Anchors** (relative to 256 canvas; locked):

- Head center `(127, 84)`, face center `(127, 88)`, eye line `y=93`, hairline `y=47`, ears `(77|177, 93)`, neck `(127, 131)`, waist `(127, 162)`, ground baseline `y=224`.
- Never crop a slot asset to its local bounding box. Export the full shared canvas so composition requires no per-item offsets.

### Seam-free swap constraints

- Adjacent parts must meet on shared seam anchors: neck, shoulder, wrist, waist, ankle, hairline, and hand/grip. Test every new asset against at least the default item in each neighboring slot.
- Keep outline weight, pixel density, lighting direction, and palette ramps identical to the canonical base. Do not independently rescale, rotate, anti-alias, or subpixel-position an equipped part.
- Clothing must fully cover the mannequin pixels indicated by its coverage mask. Use explicit masks/occlusion, not skin-colored paint inside clothing assets.
- Body/skin exports contain all potentially exposed skin. Tops, bottoms, shoes, hair, headwear, and accessories contain **no baked skin-tone pixels** unless a separately tintable mask is defined.
- Do not bake cross-slot content: no hair in a hood asset, hood in a hair asset, hands in a weapon, shoes in bottoms, pants in a top, face in body, or body shadows tied to one outfit.
- Shadows belong to the object casting them only when they are safe across every neighboring swap. Otherwise use a dedicated mask or omit them.
- Long hair, hoods, capes, handheld weapons, and similar wraparound items require back/front plates rather than violating slot boundaries.

### Required production z-order (fixed PNG stack)

Matches `public/avatar/style-c/manifest.json` and `STYLE_C_LAYER_ORDER` in `src/lib/avatarAssets.ts`:

```text
weapon.back
accessory.back
headwear.back
hair.back
body
skin          (catalog tone; starter set has no separate PNG plate)
ears
shoes
bottom
top
face
hair.front
headwear.front
accessory.front
weapon.front
```

Individual items must not invent custom global stacking rules. A slot asset that crosses the body plane must be split into its approved back/front sublayers. Missing optional plates are skipped by the resolver.

### Database / deploy note

- Local migration: `supabase/migrations/20260718130000_style_c_expanded_avatar_slots.sql` expands `shop_items.slot`, adds `body_id` / `ears_id` / `headwear_id`, seeds the 10 starter parts, cutover-backfills profiles to the Style C female default, deactivates legacy SVG-era `avatar_part` rows (**no DELETE** of economy rows), and returns an **11-key** snake_case `avatar_loadout`.
- **Status:** present in the repo; **not applied to remote** unless/until operators run it. Do not claim remote production already serves Style C loadouts solely because the client ships the compositor.

---

## Reusable base prompt

Use this block for every variant; append only the [per-variant deltas](#per-variant-prompt-deltas).

```text
Original anime pixel-chibi character sheet, front-facing neutral standing pose,
MapleStory-adjacent game avatar feel but 100% original design (no franchise
characters, logos, or copied assets). Mint-green very long hair past the hips,
long pointed elf ears, white plush bunny hood with two tall lime-green fabric
ears, heterochromia eyes (left iris green, right iris warm red-orange), pale-blue
fantasy two-piece outfit, soft peach skin, calm neutral expression.
Centered full-body on a transparent background, 256x256, generous margin,
single upper-left light, clean silhouette, chibi proportions, pixel art.
```

---

## Per-variant prompt deltas

These deltas reproduce the completed study. Use **C only** for production-direction exploration; A, B, and D are historical.

### A — Classic Sprite Chibi (historical)

```text
Style A: classic sprite chibi, crisp hard pixels, visible pixel grid, 2.5-head
proportion, 1px dark outline, restrained cel shading (one shade + one highlight),
simple readable eyes, stepped hair silhouette, retro 2D RPG sprite clarity.
```

### B — Expressive Anime Chibi (historical)

```text
Style B: expressive anime chibi, larger detailed eyes with dual highlights,
fuller hair volume around the bunny hood, softer on-grid pixel clusters,
slightly richer cel shading, cute manhwa-adjacent face, still clearly pixel art.
```

### C — Compact Game Chibi (canonical)

```text
Style C: compact game chibi, about 2-head proportion, oversized head, bold 2px
outer outline, chunky color shapes, minimal micro-detail, maximum small-size
readability for 30px UI icons, simplified eyes but heterochromia still clear.
```

### D — Polished Pixel Chibi (historical)

```text
Style D: polished pixel chibi, strict pixel grid, thin clean outline, richer
hair strand highlights and fabric folds, premium shop-hero detail, no blur,
no painterly continuous tones, quantized colors only.
```

---

## Negative prompt / constraints

Reject or regenerate if any of the following appear:

```text
franchised character lookalike, MapleStory official art copy, watermark, signature,
logo, text, speech bubble, photo background, 3D render, CGI, blurry, motion blur,
noise grain, painterly oil brush, continuous soft gradient shading, realistic anatomy,
adult fashion proportions, long realistic legs, tiny head, profile view, three-quarter
extreme turn, sitting, action pose, weapon, staff, sword, extra fingers, extra ears,
animal muzzle, switched eye colors, short bob hair, missing bunny hood, missing elf
ears, opaque white/black background matte, checkerboard background, UI frame, border,
collage, multiple characters, cropped feet, cropped ears
```

Hard constraints:

- Transparent background only on standalone plates.
- Same character identity on A–D.
- New swappable plates must honor the locked 256×256 anchors and the fixed z-order above.
- Do not claim a winner in filenames or this doc until the user chooses (historical; C is already selected).

---

## File naming

| File | Meaning |
| --- | --- |
| `elfbunny-study-a-classic.png` | Variant A standalone |
| `elfbunny-study-b-expressive.png` | Variant B standalone |
| `elfbunny-study-c-compact.png` | Variant C standalone |
| `elfbunny-study-d-polished.png` | Variant D standalone |
| `elfbunny-study-comparison.png` | Labeled A–D sheet |
| `elfbunny-study-size-check.png` | A–D at actual 30, 76, and 184 px review sizes |

Optional review downscales (not required in repo):

```text
elfbunny-study-{a|b|c|d}-classic|expressive|compact|polished@30.png
elfbunny-study-...@76.png
elfbunny-study-...@184.png
```

Production assets use slot/sublayer-oriented names under `public/avatar/style-c/`, e.g. `hair_mint_long_back.png`, `hair_mint_long_front.png`, `headwear_bunny_hood_back.png`, `headwear_bunny_hood_front.png`. File names map to catalog item IDs / `asset_key` values.

---

## Historical selection rubric

The following rubric was used to choose Variant C:

1. **Identity fidelity** — mint hair, elf ears, bunny hood, heterochromia, pale-blue outfit all correct.
2. **Style clarity** — clearly matches its A/B/C/D definition vs the others.
3. **30 px read** — hood ears + chibi head survive the chip size.
4. **76 px read** — eye colors and green separation hold.
5. **184 px appeal** — would you want this as the shop hero art direction?
6. **Layerability** — its proportions and pixel language can be redrawn as a neutral mannequin plus independent slot assets; do not judge whether the flattened study plate itself can be cut apart.
7. **Brand fit** — MapleStory-*adjacent* anime pixel chibi without looking like a franchise rip or generic AI sludge.

**Decision result:** Variant C was selected without a hybrid. The neutral female and male mannequins were approved on **2026-07-18**, sharing the locked **256×256** production attachment contract. The first Style C elf pack, 11-slot client compositor, and local migration are implemented in-repo; remote DB apply remains a separate deploy step.

---

## Canonical selection

| Field | Value |
| --- | --- |
| Selected variant | **C — Compact Game Chibi** |
| Selection date | **2026-07-18** |
| Notes / hybrid instructions | No hybrid; use Variant C rules as written |
| Production integration | **FEMALE + MALE BASES APPROVED**; Style C PNG compositor + 11-slot catalog **implemented in client**; migration `20260718130000_style_c_expanded_avatar_slots.sql` is **local / unapplied remotely** |

### Canonical recipe for all future builder assets

- **Proportion:** Approximately **2 heads tall**, with a huge round anime head and a short, chunky body.
- **Body:** Short chunky torso, arms, hands, legs, and feet; avoid thin realistic limbs or fashion proportions.
- **Outline:** Bold **2 px outer outline** at the 256×256 master canvas; inner separators may be lighter but must stay clean and sparse.
- **Face:** Simple enlarged eyes, brows, and mouth designed to remain expressive without micro-detail.
- **Color:** Broad, clean color blocks with strong separation between adjacent slots and materials.
- **Shading:** Flat base fill plus **one shadow value** per material; no extra highlight bands, gradients, bloom, or painterly rendering.
- **Pixels:** Strict hard pixel grid; no anti-aliasing, soft edges, subpixel placement, or filtered transforms.
- **Readability:** Optimize every silhouette and major feature for recognition at **30 px** before adding detail for larger previews.
- **Customizer contract:** Apply this recipe to either approved Style C female or male body under the shared 256×256 canvas, attachment anchors, masks, and fixed PNG z-order. Produce separate transparent plates for `face`, `ears`, `hair` back/front, `headwear` back/front, `top`, `bottom`, `shoes`, `accessory` back/front, and `weapon` back/front. Keep catalog IDs stable and never bake one slot's pixels into another.

---

## Related app context

- Loadout slots (11): `body`, `skin`, `face`, `ears`, `hair`, `headwear`, `top`, `bottom`, `shoes`, `accessory`, `weapon` (`src/lib/avatarComposition.ts`).
- Product model: equipped parts are composited at render time from Style C PNG URLs (`src/lib/avatarAssets.ts` → `PixelAvatar`).
- Live preview compositor: stacked PNGs at 256×256 with nearest-neighbor CSS (`.pixel-avatar` / `.pixel-avatar-layer` in `src/styles.css`).
- Display sizes: `.pixel-avatar-sm|md|lg|xl` (~30 / ~76 / ~96 / ~184 px at default root font size); `sm` uses the approved head-center bust crop.
- Shop UI: `/shop` Chibi Atelier builder tabs omit the baked `skin` tone row from the tab strip but still persist `skin_id` in the loadout.
