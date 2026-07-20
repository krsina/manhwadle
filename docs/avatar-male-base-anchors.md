# Style C Male Base — Anchors & Mask Notes

**Superseded for new product work:** use [`docs/whole-character-avatar-style-guide.md`](whole-character-avatar-style-guide.md) (Style A whole characters). Content below is historical Style C layered-customizer anchors only.

**Status: APPROVED — 2026-07-18** (historical Style C experiment)

This document records the Style C male mannequin study plate and its relationship to the approved female production anchor contract. Attachment coordinates are an **exact copy** of `docs/avatar-base-anchors.md` / `public/avatar-base-study/style-c-female-base-anchors.json`. The male plate may differ only in silhouette massing and underlayer shape; shared equipment seams must not move.

Machine-readable twin: `public/avatar-base-study/style-c-male-base-anchors.json`.

The user approved this male plate on **2026-07-18**. It now shares the locked production attachment contract with the approved female base. The production body plate ships as `public/avatar/style-c/bodies/body_male_peach.png` and is referenced from `public/avatar/style-c/manifest.json`. Slot semantics for `body`, `ears`, and `headwear` match the female contract and the 11-slot client/SQL model. Migration `20260718130000_style_c_expanded_avatar_slots.sql` remains **local / unapplied remotely** until operators deploy it.

---

## Source & outputs

| Item | Path |
| --- | --- |
| Generated chroma source | agent assets `style-c-male-base-chroma.png` (1024×1024 magenta plate) |
| Processor | `scripts/process-avatar-male-base-study.ps1` |
| Shared contract source | `public/avatar-base-study/style-c-female-base-anchors.json` |
| Transparent base | `public/avatar-base-study/style-c-male-base.png` |
| Labeled anchor overlay | `public/avatar-base-study/style-c-male-base-anchors.png` |
| Actual-size readability | `public/avatar-base-study/style-c-male-base-size-check.png` |
| JSON manifest | `public/avatar-base-study/style-c-male-base-anchors.json` |

Processing: robust magenta chroma removal → nearest-neighbor resize to exact **256×256** `Format32bppArgb` → integer nearest-neighbor registration (`translateX`, `translateY`) to lock shared baseline `y=224` and figure centerline bias → write shared anchors verbatim from the approved female JSON.

---

## Subtle male silhouette differences

Shared anchors stay fixed. Observed plate-only differences after registration:

| Field | Female (approved) | Male (measured) |
| --- | --- | --- |
| Silhouette bounds | `L73 T38 R181 B224` (109×187) | `L71 T30 R184 B224` (114×195) |
| Underlayer bounds | `L105 T145 R161 B189` (bandeau + shorts) | `L107 T131 R148 B191` (sleeveless tank + shorts) |
| Torso read | Narrower midriff / bandeau gap | Slightly broader / taller torso mass under a continuous tank |
| Head / jaw | Rounder female study mass | Same bald blank plate language with slightly squarer jaw massing in the source art |
| Width bias | Center mass near `x=127` | Same after registration (`translateX=-2`, `translateY=-5`) |

These differences are silhouette/underlayer only. Universal clothing must still register to the shared seams without body-specific offsets. Body-specific art remains optional.

---

## Fitted neutral-gray underlayer

| Field | Value |
| --- | --- |
| Purpose | Modest review underlayer only; not a fashion `top`/`bottom` catalog item |
| Top | Fitted **sleeveless** gray tank / undershirt with thin straps |
| Bottom | Matching gray shorts |
| Measured gray bounds | `L107 T131 R148 B191` |
| Fit | Contained inside the skin outline; no overhang past the body silhouette |

Production clothing replaces visual coverage of these gray pixels; the gray underlayer is a review aid and default modest fill, not a permanent baked outfit.

---

## Human ears & blank face

- Small rounded **human** ears are part of the skin/head silhouette (same contract ears as female).
- Face is blank (no eyes, nose, or mouth baked in).
- Ear centers remain locked at `(77, 93)` and `(177, 93)` on eye line `y=93`.
- Hair / hood / `headwear` art must intentionally clear, cover, or frame these human ears.
- Optional `ears` overlays register to the same centers; unequipping reveals the human ear silhouette.
- `face` slot art draws only features inside the shared face bounds; no baked skin plate.

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
| Margin | Transparent margin on all sides (≥6 px); feet baseline at `y=224` leaves ground clearance below |

---

## Identical shared anchors (256×256)

These coordinates are copied exactly from the approved female contract. Processing **fails** if any shared anchor in the male JSON differs from the female JSON.

### Head / face

| Anchor | Coordinate | Notes |
| --- | --- | --- |
| Canvas center | `(128, 128)` | Geometric canvas center |
| Head center | `(127, 84)` | Shared |
| Face center | `(127, 88)` | Shared |
| Face bounds | `L83 T49 R171 B128` | Shared interior face plate |
| Eye line | `y=93` | Shared |
| Hairline | `y=47` | Shared |
| Ear left (human) | `(77, 93)` | Shared |
| Ear right (human) | `(177, 93)` | Shared |
| Neck | `(127, 131)` | Shared |

### Torso / arms

| Anchor | Coordinate |
| --- | --- |
| Shoulder left | `(103, 142)` |
| Shoulder right | `(152, 142)` |
| Elbow left | `(96, 163)` |
| Elbow right | `(158, 163)` |
| Wrist / hand left | `(95, 185)` |
| Wrist / hand right | `(159, 185)` |
| Waist | `(127, 162)` |
| Hip left | `(105, 178)` |
| Hip right | `(150, 178)` |

### Legs / ground

| Anchor | Coordinate |
| --- | --- |
| Knee left | `(116, 196)` |
| Knee right | `(139, 196)` |
| Ankle left | `(116, 203)` |
| Ankle right | `(139, 203)` |
| Sole left | `(112, 224)` |
| Sole right | `(142, 224)` |
| Ground baseline | `y=224` |

---

## Compatibility table (male JSON vs approved female JSON)

Automated verification in `scripts/process-avatar-male-base-study.ps1` compares every shared attachment point and fails the run on any mismatch.

| Anchor | Male | Female | Match |
| --- | --- | --- | --- |
| canvasCenter | (128,128) | (128,128) | YES |
| headCenter | (127,84) | (127,84) | YES |
| faceCenter | (127,88) | (127,88) | YES |
| eyeLineY | 93 | 93 | YES |
| hairlineY | 47 | 47 | YES |
| earLeft | (77,93) | (77,93) | YES |
| earRight | (177,93) | (177,93) | YES |
| neck | (127,131) | (127,131) | YES |
| shoulderLeft | (103,142) | (103,142) | YES |
| shoulderRight | (152,142) | (152,142) | YES |
| elbowLeft | (96,163) | (96,163) | YES |
| elbowRight | (158,163) | (158,163) | YES |
| wristLeft | (95,185) | (95,185) | YES |
| wristRight | (159,185) | (159,185) | YES |
| waist | (127,162) | (127,162) | YES |
| hipLeft | (105,178) | (105,178) | YES |
| hipRight | (150,178) | (150,178) | YES |
| kneeLeft | (116,196) | (116,196) | YES |
| kneeRight | (139,196) | (139,196) | YES |
| ankleLeft | (116,203) | (116,203) | YES |
| ankleRight | (139,203) | (139,203) | YES |
| soleLeft | (112,224) | (112,224) | YES |
| soleRight | (142,224) | (142,224) | YES |
| groundBaselineY | 224 | 224 | YES |
| faceBounds | L83 T49 R171 B128 | L83 T49 R171 B128 | YES |

---

## Approved skin silhouette / coverage mask (intent)

Coverage intent matches the female contract so universal clothing can occlude either body:

- **Skin silhouette** = opaque peach/skin + dark outline of body, head, ears, neck, arms, hands, legs, and feet.
- **Measured opaque silhouette bounds (male):** `L71 T30 R184 B224`.
- **Always exposed unless covered by a slot:** head face disk (inside shared face bounds), human ears, neck, mid-torso regions not covered by future `top`/`bottom`, lower arms/hands, lower legs/feet.
- Slot expectations (`body`, `top`, `bottom`, `shoes`, `hair`, `face`, `ears`, `headwear`, `accessory`, `weapon`) follow the female seam list; do not invent male-only attachment offsets. Catalog id for this plate: `body_male_peach`.

Clothing assets must **not** bake skin-tone pixels. Use coverage/occlusion against the silhouette instead.

---

## Z-order (production PNG stack)

Fixed order from `public/avatar/style-c/manifest.json` / `STYLE_C_LAYER_ORDER`:

```text
weapon.back
accessory.back
headwear.back
hair.back
body                         ← this base plate (male or female)
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

Individual items must not invent custom global stacking. Wraparound items use approved back/front sublayers.

---

## Seam / occlusion rules

- Shared seams (identical on male and female): hairline `y=47`, ears `(77|177, 93)`, neck `(127, 131)`, shoulders `(103|152, 142)`, elbows `(96|158, 163)`, wrists `(95|159, 185)`, waist `(127, 162)`, hips `(105|150, 178)`, knees `(116|139, 196)`, ankles `(116|139, 203)`, soles/baseline `y=224`.
- Adjacent slot art must meet on these seams without gaps or double-outline stacks.
- Occlusion: clothing covers mannequin pixels via layering/masks — do not paint skin into clothing plates.
- Outline weight, light direction (upper-left), and Style C pixel recipe must match the base.
- No cross-slot baking (no hair in hoods, hands in weapons, shoes in bottoms, etc.).

---

## Full 256 canvas rule

Every production plate must:

1. Be exactly **256×256**.
2. Use the same origin and transparent padding as this base.
3. Keep the character registered to the shared anchors above.
4. Avoid local crops, per-item offsets, filtered scaling, or subpixel placement.

---

## Approval status

| Field | Value |
| --- | --- |
| Approval status | **approved** |
| Approval date | **2026-07-18** |
| Production contract | This male plate shares the locked production attachment contract with the approved female base |
| Allowed now | Swappable-part art and Style C client compositing against either approved Style C base under the identical shared anchors |
| Deploy note | Production manifest: `public/avatar/style-c/manifest.json`. SQL migration `20260718130000_style_c_expanded_avatar_slots.sql` is local / unapplied remotely |

This male base and its attachment registration are production-final for art alignment under the shared contract.
