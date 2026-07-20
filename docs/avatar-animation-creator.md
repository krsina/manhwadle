# Avatar Animation Creator

Dev tool for authoring **idle → action → return** Style A animation loops.

Route: [`/dev/animations`](../src/pages/AnimationCreatorPage.tsx) (also linked from Dev tools).  
Art rules: [avatar-awakening-animation-style-guide.md](./avatar-awakening-animation-style-guide.md).

## Why this exists

Consumer shop Awakenings play a registered strip. Authoring that strip used to be ad-hoc and easy to break (offset remappers, white-robe flood clears). The Creator freezes **intent + identity context** into a Cursor job package so frames are generated the same way as in chat: sequential `GenerateImage` with previous-frame references.

## Loop model

Every animation is one continuous strip:

1. **Idle** — ready stance, secondary motion  
2. **Action** — one cool beat (front-facing)  
3. **Return** — ease back to idle  

Default frame plan: **6 + 18 + 2 = 26**. Frame 1 and the last frame are **production plate copies** (never AI).

## Avatar context

Every catalog row in [`avatarComposition.ts`](../src/lib/avatarComposition.ts) includes:

- `inspirationSeries` / `inspirationCharacter` (internal manhwa/trope labels — never shop copy)
- `traits` (hair, eyes, outfit, props, aura)

**Use defaults** builds idle/action/return text from that context so Generate works without typing.

## Consistency (must pass)

Before accepting any generated frame:

1. **Same model** as the production plate — no mid-loop redesign that only “snaps back” on frame 1/last.  
2. **Same wardrobe** — belt/sash color & shape, garments, shoes, ornaments, embroidery match the plate (no recolors or invented parts).  
3. **Same weapon hand / screen side** as the plate — no hand swaps or mirroring.  
4. **Feet / root locked** — no foot teleports; processor plate-registers mid-frames.  
5. **No outfit holes** — white/light fills stay opaque; reject punched transparency.

These locks are baked into Animation Creator prompts (`HARD LOCKS` block) and the animation style guide.

**More frames** only help after locks hold. A longer strip of drifted cousins still pops on loop wrap.

### GenerateImage-only production export

Job packages encode the **plate-composite** pipeline:

1. **Idle / return** — `scripts/avatar-anim-idle-composite.ps1` (no AI body).  
2. **Action only** — GenerateImage prompts for action frames.  
3. After each AI frame — `scripts/avatar-anim-accept-frame.ps1` (register + paste head/sash/feet + gates).  
4. Oneshot multi-sheet bridges remain **draft-only** in the export.

Pink/plum FX avatars export **`chromaHex: #00FF00`**.

Generate does **not** call an image API in the browser. It:

1. Marks the animation `spec_ready`
2. Downloads `{id}.job.json` + `{id}.PROMPTS.md`
3. Instructs saving under `tmp/animation-jobs/{id}/`

An agent then:

1. Copies the plate to `seq/f01.png` (and final frame)
2. Runs each prompt with `reference_image_paths` = **[production plate, previous frame]** (plate first, always)
3. Rejects drifted frames before continuing the chain
4. Stitches with [`scripts/process-awakening-strip.ps1`](../scripts/process-awakening-strip.ps1) (plate-registered mid-frames)

## Robe-safe processing (critical)

`ClearFakeBackground` must **never** treat outfit whites as matte.

Allowed edge flood only:

- Magenta / soft magenta **or green / soft green** chroma key (prefer `#00FF00` when FX are pink)  
- Mid-gray checker mats  
- Pure paper-white AI canvas (`min >= 242`, low chroma) — stopped by ink outlines so shaded white robes stay  

Do **not** flood-clear `min >= 168` near-whites (that ate murim robes).

## Library storage

Drafts live in `localStorage` (`manhwadle.avatar-animation-library.v1`). Specs are portable via the downloaded job JSON.
