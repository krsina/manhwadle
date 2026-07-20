# Avatar Awakening — Product Guide

> **Production status:** Awakenings are **disabled** (`AVATAR_AWAKENINGS_ENABLED = false`; shop catalog deactivated). Static plates only until animation quality is ready.

Purchasable **Awakening** upgrade for owned Style A whole-character avatars (when re-enabled).

**Animation / art process:** [avatar-awakening-animation-style-guide.md](./avatar-awakening-animation-style-guide.md)  
**Character look:** [whole-character-avatar-style-guide.md](./whole-character-avatar-style-guide.md)

## Product rules

| Level | Shop name | Feel |
| --- | --- | --- |
| 0 | (base) | Static Style A plate |
| 1 | Awakening | Continuous frame-by-frame strip: idle → cool action → return to idle |

- Only **premium** avatars (`price > 0`) are awakenable. Starters stay static.
- There is a **single** Awakening per character (no I / II tiers).
- If no strip is registered for that avatar, the UI may still sell the upgrade but the portrait stays on the static plate until art lands.

## Runtime

`PixelAvatar` resolves presentation via `resolveAvatarPresentation`:

- **Sheet registered** and `awakeningLevel >= 1` → horizontal sprite strip + JS frame stepping
- **Otherwise** → single static PNG

There is **no** CSS bob, aura ring, or particle FX layer. Motion lives only in the sheet pixels.

`sm` busts stay static for header perf. `prefers-reduced-motion` freezes on the first sheet frame.

## Shop UX

On an owned character’s detail pane: one **Awakening** card, live preview on click/hover (plays the continuous strip when available).

## Test art

Plum Blossom Blade is the first registered continuous strip — see the animation style guide.

**Authoring:** use the [Animation Creator](./avatar-animation-creator.md) at `/dev/animations` to spec idle/action/return and export Cursor job packages.
