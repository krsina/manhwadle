# External AI sprite pipeline (production path)

Companion to [avatar-awakening-animation-style-guide.md](./avatar-awakening-animation-style-guide.md).  
Cursor `GenerateImage` is for **drafts only**. Production identity + fluid motion need pose control or video temporal coherence.

## Why leave Cursor for generation

Cursor soft refs cannot lock seed, denoise, ControlNet, or LoRA. Use ComfyUI / Scenario / similar for final keys; keep Manhwadle for specs, stitch, QA.

## Path A — Pose-ControlNet (recommended for readable beats)

1. **Plate** = identity authority (`public/avatar-characters/style-a/{slug}.png`).
2. Author a **pose storyboard** (OpenPose / stick figures), e.g. Plum pilot JSON under `tmp/animation-jobs/.../external-pilot/pose-storyboard.json`.
3. For each key: IP-Adapter or LoRA on plate + OpenPose ControlNet (~0.6–0.8) + optional low-denoise img2img from the previous **accepted** frame (≈0.35–0.55).
4. Solid **`#00FF00`** background for pink/plum FX characters.
5. Save as `seq/fNN.png` → `scripts/process-awakening-strip.ps1` → `scripts/avatar-anim-reject-gates.ps1` (belt + face + shoes + embroidery + **head size**).
6. Optional wardrobe rescue: `scripts/avatar-anim-locked-region-paste.ps1`.
7. Register in `avatarAwakening.ts` / copy to `public/avatar-characters/style-a/awakened/{slug}.png`.

## Path B — Video-first (best fluidity)

1. Generate **1–2s** clip anchored on the plate as frame 0 (Seedance / Veo / Kling / etc.).
2. Scrub readable keys; extract N frames:

```powershell
.\scripts\extract-video-sprite-frames.ps1 `
  -Video "tmp\animation-jobs\{id}\external-pilot\action.mp4" `
  -OutDir "tmp\animation-jobs\{id}\external-pilot\seq" `
  -FrameCount 18
```

3. Optionally light img2img each extract toward the plate for identity.
4. Same process + reject gates as Path A.
5. Idle segment: prefer plate-locked FX composite (Method 1) so idle never morphs; AI only for action keys.

## Bridge sheets (Cursor drafts only)

When still prototyping in Cursor with 6-cell oneshots:

```powershell
.\scripts\split-action-sheet-bridge.ps1 `
  -Sheet "tmp\...\oneshot-bridged\sheet-A.png" `
  -Cells 6 `
  -Out "tmp\...\oneshot-bridged\bridge-after-A.png"
```

Next sheet refs = **[plate, bridge-after-A]** — never the whole atlas. Job packages from `/dev/animations` export this workflow automatically.

## Plum Blossom Blade pilot checklist

See `tmp/animation-jobs/anim_avatar_plum_blossom_blade_26f/external-pilot/README.md`.

| Step | Owner | Status |
| --- | --- | --- |
| Pose storyboard (6–18 keys) | Author | Checked into pilot folder |
| Generate via ControlNet **or** plate-anchored video | External tool | Run outside Cursor |
| Extract / drop frames into `external-pilot/seq/` | `extract-video-sprite-frames.ps1` or manual | |
| Process + gates | `process-awakening-strip.ps1`, `avatar-anim-reject-gates.ps1` | |
| Preview | `/dev/action-strip-preview` | |
| Ship to `awakened/plum-blossom-blade.png` | Copy + registry | |

## Do not

- Rely on Cursor oneshot atlases for final identity.
- Reference a whole prior atlas as the next soft-ref (use the last cell bridge).
- Use magenta chroma when slash/petal FX are pink — prefer green `#00FF00`.
