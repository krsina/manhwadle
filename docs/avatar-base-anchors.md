# Style C Female Base — Anchors & Mask Notes

**Superseded for new product work:** use [`docs/whole-character-avatar-style-guide.md`](whole-character-avatar-style-guide.md) (Style A whole characters). Content below is historical Style C layered-customizer anchors only.

**Status: APPROVED — 2026-07-18** (historical Style C experiment)

This document records the measured anchor map for the neutral modest Style C female mannequin. Coordinates are practical exact pixel indices on the shared **256×256** master canvas (origin top-left). Values were derived from `public/avatar-base-study/style-c-female-base.png` after chroma-key processing of the approved generated source. The user approved this mannequin and anchor map on **2026-07-18**; these coordinates are now the **production anchor contract** for all swappable-part art.

Machine-readable twin: `public/avatar-base-study/style-c-female-base-anchors.json`.

The mannequin and anchors are production-final for art alignment. Style C production plates and the client PNG compositor use this contract via `public/avatar/style-c/manifest.json` (`sharedContractRef`: `style-c-female-base-anchors.json`). The body plate ships as `public/avatar/style-c/bodies/body_female_peach.png`. Migration `20260718130000_style_c_expanded_avatar_slots.sql` encodes `body` / `ears` / `headwear` slots in SQL but remains **local / unapplied remotely** until operators deploy it.

---

## Source & outputs

| Item | Path |
| --- | --- |
| Generated chroma source | agent assets `style-c-female-base-chroma.png` (1024×1024 magenta plate) |
| Processor | `scripts/process-avatar-base-study.ps1` |
| Transparent base | `public/avatar-base-study/style-c-female-base.png` |
| Labeled anchor overlay | `public/avatar-base-study/style-c-female-base-anchors.png` |
| Actual-size readability | `public/avatar-base-study/style-c-female-base-size-check.png` |
| JSON manifest | `public/avatar-base-study/style-c-female-base-anchors.json` |

Processing: robust magenta chroma removal → nearest-neighbor resize to exact **256×256** `Format32bppArgb` PNG with transparent background.

---

## Canvas contract

| Field | Value |
| --- | --- |
| Size | **256×256** px |
| Format | sRGB PNG-32 / `Format32bppArgb` |
| Origin | Top-left `(0,0)` |
| Background | Fully transparent (alpha 0) |
| Canvas center | `(128, 128)` |
| Full-canvas rule | Every future slot asset must export the **full 256×256** canvas with the same origin, scale, pose, and transparent padding. Never crop to a local bounding box or invent per-item offsets. |
| Silhouette bounds | `L73 T38 R181 B224` (width 109, height 187) |
| Margin | Transparent margin on all sides (≥6 px); feet baseline at `y=224` leaves ground clearance below |

---

## Exact anchors (256×256)

Symmetric pairs share the vertical centerline bias of the figure (`x≈127`). The figure is front-facing and mirrored across `x=128`.

### Head / face

| Anchor | Coordinate | Notes |
| --- | --- | --- |
| Canvas center | `(128, 128)` | Geometric canvas center (not body COM) |
| Head center | `(127, 84)` | Center of head silhouette bbox including ears |
| Face center | `(127, 88)` | Center of face bounds |
| Face bounds | `L83 T49 R171 B128` | Interior face plate region for `face` slot alignment |
| Eye line | `y=93` | Horizontal through human ear centers |
| Hairline | `y=47` | Upper forehead curve inside top outline |
| Ear left (human) | `(77, 93)` | Small rounded **human** ear mass (not elf, not absent) |
| Ear right (human) | `(177, 93)` | Mirror of left |
| Neck | `(127, 131)` | Narrowest seam between head and torso |

### Torso / arms

| Anchor | Coordinate | Notes |
| --- | --- | --- |
| Shoulder left | `(103, 142)` | Outer upper-torso / arm attach |
| Shoulder right | `(152, 142)` | Mirror |
| Elbow left | `(96, 163)` | Mid outer arm |
| Elbow right | `(158, 163)` | Mirror |
| Wrist / hand left | `(95, 185)` | Distal hand stub |
| Wrist / hand right | `(159, 185)` | Mirror |
| Waist | `(127, 162)` | Mid exposed midriff between bandeau and shorts |
| Hip left | `(105, 178)` | Outer shorts gray edge at mid-shorts |
| Hip right | `(150, 178)` | Mirror |

### Legs / ground

| Anchor | Coordinate | Notes |
| --- | --- | --- |
| Knee left | `(116, 196)` | Mid separated-leg column |
| Knee right | `(139, 196)` | Mirror |
| Ankle left | `(116, 203)` | Narrow pre-flare leg column above foot pad |
| Ankle right | `(139, 203)` | Mirror |
| Sole left | `(112, 224)` | Center of left foot contact run |
| Sole right | `(142, 224)` | Center of right foot contact run |
| Ground baseline | `y=224` | Lowest opaque sole row; shared shoe contact line |

---

## Approved skin silhouette / coverage mask

Approved production coverage intent for clothing designers:

- **Skin silhouette** = all opaque peach/skin + dark outline pixels of the mannequin body, head, ears, neck, arms, hands, legs, and feet.
- **Measured opaque silhouette bounds:** `L73 T38 R181 B224`.
- **Always exposed unless covered by a slot:** head face disk (inside face bounds), human ears, neck, midriff band around waist `(127, 162)`, lower arms/hands, lower legs/feet.
- **Coverage expectations by production slots:**
  - `body` — this mannequin plate (peach silhouette + modest gray underlayer). Catalog id `body_female_peach`.
  - `top` — must cover bandeau torso band and intended shoulder/arm spans down to the waist seam; may leave midriff visible for crop tops.
  - `bottom` — must cover shorts hip region around hips `(105–150, 178)` down to the intended hem; waist seam shared with `top`.
  - `shoes` — align to ankles `(116|139, 203)`, soles `(112|142, 224)`, and baseline `y=224`; must cover foot pads (or use transparent `shoes_bare`).
  - `hair` — hairline `y=47`; human ears may peek beside/under hair unless `ears` / `headwear` cover them.
  - `face` — draw only features inside face bounds; no baked skin plate.
  - `ears` — optional pointed/elf overlays registered to ear centers `(77|177, 93)`; unequipping reveals the human ear silhouette.
  - `headwear` — hoods/hats (starter: bunny hood back/front); clear or frame human/`ears` plates intentionally.
  - `accessory` / `weapon` — use shared head/hand anchors; split back/front when wrapping the body.

Clothing assets must **not** bake skin-tone pixels. Use coverage/occlusion against this silhouette instead.

---

## Fitted neutral-gray underlayer

| Field | Value |
| --- | --- |
| Purpose | Modest review underlayer only; not a fashion `top`/`bottom` catalog item |
| Measured gray bounds | `L105 T145 R161 B189` |
| Bandeau band | ≈ `y=145–158`, torso-centered |
| Shorts band | ≈ `y=173–189`, hip-centered |
| Midriff gap | ≈ `y=159–172` exposed skin between pieces |
| Fit | Contained inside the skin outline; no overhang past the body silhouette |

Production clothing replaces visual coverage of these gray pixels; the gray underlayer is a review aid and default modest fill, not a permanent baked outfit.

---

## Human ears (important correction)

- This base includes small, rounded **human** ears as part of the skin/head silhouette.
- **Do not** assume a no-ear mannequin.
- **Do not** assume elf/pointed ears from the historical study subject.
- Ear centers are locked at `(77, 93)` and `(177, 93)` on the eye line.
- Hair and hood/`headwear` art must intentionally clear, cover, or frame these human ears.
- Optional `ears` slot overlays (starter: pointed elf tips) register to the same centers.

---

## Symmetry / centerline

- Vertical centerline: `x=128` (canvas) with figure mass centered near `x=127`.
- Pose is front-facing, relaxed A-pose, limbs mirrored.
- Left/right anchors are mirror pairs across the centerline.
- Future parts must preserve this symmetry unless an item is explicitly asymmetric (e.g. a one-handed weapon), and even then must still register to the shared hand/grip anchors.

---

## Z-order (production PNG stack)

Fixed order from `public/avatar/style-c/manifest.json` / `STYLE_C_LAYER_ORDER`:

```text
weapon.back
accessory.back
headwear.back
hair.back
body                         ← this base plate
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

Individual items must not invent custom global stacking. Wraparound items use approved back/front sublayers. Optional empty slots are skipped by the resolver.

---

## Seam / occlusion rules

- Shared seams: hairline `y=47`, ears `(77|177, 93)`, neck `(127, 131)`, shoulders `(103|152, 142)`, wrists `(95|159, 185)`, waist `(127, 162)`, hips `(105|150, 178)`, ankles `(116|139, 203)`, soles/baseline `y=224`.
- Adjacent slot art must meet on these seams without gaps or double-outline stacks.
- Occlusion: clothing covers mannequin pixels via layering/masks — do not paint skin into clothing plates.
- Outline weight, light direction (upper-left), and Style C pixel recipe must match the base.
- No cross-slot baking (no hair in hoods, hands in weapons, shoes in bottoms, etc.).
- Shadows belong only to the casting object when safe across swaps; otherwise omit or use a dedicated mask.

---

## Full 256 canvas rule

Every production plate (`body`, `face`, `ears`, `hair` back/front, `headwear` back/front, `top`, `bottom`, `shoes`, `accessory` back/front, `weapon` back/front) must:

1. Be exactly **256×256**.
2. Use the same origin and transparent padding as this base.
3. Keep the character registered to the anchors above.
4. Avoid local crops, per-item offsets, filtered scaling, or subpixel placement.

---

## Approval status

| Field | Value |
| --- | --- |
| Approval status | **approved** |
| Approval date | **2026-07-18** |
| Production contract | The coordinates in this document and the JSON manifest are locked for all swappable-part art |
| Allowed now | Swappable-part art and Style C client compositing against this mannequin, mask intent, z-order, seams, and full-canvas contract |
| Deploy note | Production manifest: `public/avatar/style-c/manifest.json`. SQL migration `20260718130000_style_c_expanded_avatar_slots.sql` is local / unapplied remotely |

These coordinates are the single shared production anchor contract. Future swappable parts must align to this mannequin without changing its canvas, pose, scale, baseline, or anchors.
