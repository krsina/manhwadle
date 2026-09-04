/**
 * Avatar animation library: idle → action → return loop specs for the Animation Creator.
 * Generation runs via Cursor agent from exported job packages (not an in-browser image API).
 */

import {
  AVATAR_CHARACTER_META,
  avatarAssetUrl,
  getAvatarCharacterMeta,
  normalizeEquippedAvatarId,
  type AvatarCharacterMeta,
} from './avatarComposition'
import { avatarIdentityPromptLines, avatarTraits } from './avatarTraits'

export type AnimationStatus = 'draft' | 'spec_ready' | 'sheet_ready'

export type AnimationStepId = 'idle' | 'action' | 'return'

export interface AnimationFramePlan {
  idle: number
  action: number
  return: number
}

export interface AnimationSteps {
  idle: string
  action: string
  return: string
}

export interface AvatarAnimation {
  id: string
  avatarId: string
  name: string
  steps: AnimationSteps
  framePlan: AnimationFramePlan
  status: AnimationStatus
  /** Public path under /avatar-characters/... when a strip exists. */
  sheetPath: string | null
  createdAt: string
  updatedAt: string
}

/** Preferred chroma for AI canvases / letterbox pads. Green when FX are pink/plum. */
export type AnimationChromaHex = '#00FF00' | '#FF00FF'

export interface AnimationBridgeSheet {
  /** Sheet label within the action multi-sheet pass (A, B, C…). */
  id: string
  cellCount: number
  /** Global strip frame numbers covered by this sheet (action segment). */
  globalFrames: number[]
  /** Conceptual reference paths for GenerateImage — never the whole prior atlas. */
  referencePaths: string[]
  /** Path to write the last cell alone as the next sheet’s bridge. */
  bridgeOutPath: string
  prompt: string
}

export interface AnimationJobPackage {
  animationId: string
  avatarId: string
  avatarName: string
  inspirationSeries: string
  inspirationCharacter: string
  identityLines: string[]
  platePath: string
  steps: AnimationSteps
  framePlan: AnimationFramePlan
  totalFrames: number
  /** f01 and last frame are plate copies — do not AI-regenerate. */
  plateLockedFrames: number[]
  /** GenerateImage prompts — action frames only (idle/return are composites). */
  prompts: Array<{ frame: number; segment: AnimationStepId; prompt: string }>
  processHint: string
  /** Solid canvas chroma for prompts + processor letterbox. */
  chromaHex: AnimationChromaHex
  /** Why this chroma was chosen. */
  chromaReason: string
  /**
   * Multi-sheet oneshot bridge plan — draft layout only, not production.
   * Production uses one GenerateImage frame at a time + accept-frame.
   */
  bridgeSheets: AnimationBridgeSheet[] | null
  /** Ordered production workflow for the exported PROMPTS.md. */
  productionWorkflow: string[]
  /** Draft-only oneshot bridge notes (optional). */
  bridgeWorkflow: string[]
  /** Frames built by idle-composite (no GenerateImage body). */
  compositeFrames: number[]
  /** Frames that require GenerateImage + accept-frame. */
  generateImageFrames: number[]
}

export const DEFAULT_FRAME_PLAN: AnimationFramePlan = {
  idle: 6,
  action: 18,
  return: 2,
}

const STORAGE_KEY = 'manhwadle.avatar-animation-library.v1'

export function totalFrames(plan: AnimationFramePlan): number {
  return plan.idle + plan.action + plan.return
}

export function segmentForFrame(
  frame: number,
  plan: AnimationFramePlan = DEFAULT_FRAME_PLAN,
): AnimationStepId {
  if (frame < 1) return 'idle'
  if (frame <= plan.idle) return 'idle'
  if (frame <= plan.idle + plan.action) return 'action'
  return 'return'
}

export function buildDefaultSteps(avatarId: string): AnimationSteps {
  const meta = getAvatarCharacterMeta(avatarId) ?? AVATAR_CHARACTER_META[0]
  const traits = avatarTraits(meta.id)
  const prop = traits.props.replace(/^MUST\s+/i, '')
  const aura = traits.aura
  return {
    idle: `Ready idle: planted feet (same plant as plate), light breath, subtle hair/outfit sway, ${aura} drift gently. Keep ${prop} at rest angle. Do not change belt, garments, or shoes.`,
    action: `Cool signature beat inspired by ${meta.inspirationSeries} (${meta.inspirationCharacter}): readable flourish with ${prop}, denser ${aura}, still front-facing — no foreshortening, no slash afterimages. Feet glued; wardrobe unchanged.`,
    return: `Ease back to the production-plate ready stance. Match silhouette, feet plant, wardrobe, and prop angle to frame 1.`,
  }
}

export function createAnimationDraft(avatarId: string, name?: string): AvatarAnimation {
  const id = normalizeEquippedAvatarId(avatarId)
  const meta = getAvatarCharacterMeta(id)!
  const now = new Date().toISOString()
  return {
    id: `anim_${id}_${Date.now().toString(36)}`,
    avatarId: id,
    name: name?.trim() || `${meta.name} Awakening`,
    steps: buildDefaultSteps(id),
    framePlan: { ...DEFAULT_FRAME_PLAN },
    status: 'draft',
    sheetPath: null,
    createdAt: now,
    updatedAt: now,
  }
}

function frameDeltaHint(frame: number, plan: AnimationFramePlan, steps: AnimationSteps): string {
  const segment = segmentForFrame(frame, plan)
  if (frame === 1) return 'Exact production plate copy — do not regenerate.'
  if (frame === totalFrames(plan)) return 'Exact production plate copy for seamless loop — do not regenerate.'
  if (segment === 'idle') {
    return `IDLE intent: ${steps.idle}. Apply 1–3 tiny pixel deltas from frame ${frame - 1} only (hair tip, prop tip, aura chips, 1px breath). Feet, belt, shoes, and garment blocks stay pixel-locked.`
  }
  if (segment === 'action') {
    const local = frame - plan.idle
    const peak = Math.ceil(plan.action / 2)
    const phase =
      local < peak ? 'build toward peak' : local === peak ? 'hold peak pose' : 'begin recover toward idle'
    return `ACTION (${phase}): ${steps.action}. Tiny deltas from frame ${frame - 1}; feet glued; belt/garments unchanged; prop angle may move ≤ ~12°.`
  }
  return `RETURN: ${steps.return}. Move closer to production plate / frame 1. Tiny deltas from frame ${frame - 1}; restore exact garment + foot plant.`
}

/** Prefer green chroma when aura/outfit FX are pink/plum (magenta keys eat pink glow). */
export function prefersGreenChroma(meta: AvatarCharacterMeta): boolean {
  const traits = avatarTraits(meta.id)
  const blob = [meta.description, traits.aura, traits.outfit, traits.props]
    .join(' ')
    .toLowerCase()
  return /pink|plum blossom|rose petal|magenta/.test(blob)
}

export function chromaForAvatar(meta: AvatarCharacterMeta): {
  hex: AnimationChromaHex
  reason: string
} {
  if (prefersGreenChroma(meta)) {
    return {
      hex: '#00FF00',
      reason:
        'Pink/plum FX on this avatar — use solid #00FF00 green so chroma keying does not eat energy glow.',
    }
  }
  return {
    hex: '#FF00FF',
    reason: 'No pink/plum FX conflict — solid #FF00FF magenta is fine.',
  }
}

/** Shared reject criteria baked into every mid-frame prompt. */
export function animationHardLockLines(prevFrame: number, chroma: AnimationChromaHex = '#00FF00'): string[] {
  const chromaLabel = chroma === '#00FF00' ? 'green #00FF00' : 'magenta #FF00FF'
  return [
    'HARD LOCKS (reject & regenerate if any fail — identity, clothing, registration, continuity):',
    `- CONTINUATION: this frame must read as a 1–3px continuation of FRAME ${prevFrame}, not a new drawing of the same character.`,
    `- MODEL: same face, eye shape, hair mass/ornament, body proportions (~2.5 heads) as the production plate and FRAME ${prevFrame}. No cousin redesign or head growth.`,
    `- WARDROBE: same garment blocks, sash/belt color & shape, trim colors, shoes, ornaments, embroidery as the plate — do not recolor, restyle, or invent parts.`,
    `- PROP: stays in the SAME hand and SAME screen side as the plate — never swap hands or mirror.`,
    `- CAMERA / FRAMING: same crop, character scale, and screen placement as the plate. Do not zoom, pan, or re-center the figure.`,
    `- FEET / ROOT: both feet stay planted in the same screen positions as the plate (±1–2px). No sliding, hopping, or teleport.`,
    `- MOTION BUDGET: after alignment, body/root may move ≤2px vs FRAME ${prevFrame}; limbs/prop tips ≤4px; hair/aura chips ≤3px. Larger jumps = reject.`,
    `- OPACITY: white/light outfit pixels stay fully opaque — no holes, checker punch-through, or see-through robe.`,
    `- POSE: front-facing; no foreshortening, slash arcs, afterimages, or soft bloom.`,
    `- CANVAS: square 256×256 preferred (or square letterbox). Solid ${chromaLabel} background. Same margins as the plate.`,
  ]
}

const BRIDGE_CELLS_PER_SHEET = 6

/** Split action frames into equal 6-cell oneshot sheets with plate+bridge refs. */
export function buildBridgeSheets(
  animationId: string,
  meta: AvatarCharacterMeta,
  plan: AnimationFramePlan,
  steps: AnimationSteps,
  chroma: AnimationChromaHex,
): { sheets: AnimationBridgeSheet[]; workflow: string[] } | null {
  if (plan.action < BRIDGE_CELLS_PER_SHEET) return null
  const sheetCount = Math.max(1, Math.floor(plan.action / BRIDGE_CELLS_PER_SHEET))
  if (sheetCount < 2) return null

  const platePath = `public/avatar-characters/style-a/${meta.assetPath}`
  const jobRoot = `tmp/animation-jobs/${animationId}/oneshot-bridged`
  const chromaLabel = chroma === '#00FF00' ? 'solid #00FF00 green' : 'solid #FF00FF magenta'
  const sheets: AnimationBridgeSheet[] = []
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  for (let s = 0; s < sheetCount; s++) {
    const id = letters[s] ?? `S${s + 1}`
    const startLocal = s * BRIDGE_CELLS_PER_SHEET + 1
    const endLocal = Math.min(plan.action, (s + 1) * BRIDGE_CELLS_PER_SHEET)
    const globalFrames: number[] = []
    for (let local = startLocal; local <= endLocal; local++) {
      globalFrames.push(plan.idle + local)
    }
    const cellCount = globalFrames.length
    const prevBridge =
      s === 0
        ? null
        : `${jobRoot}/bridge-after-${letters[s - 1]}.png`
    const referencePaths =
      prevBridge == null ? [platePath] : [platePath, prevBridge]
    const phase =
      s === 0
        ? 'wind-up from idle / ready'
        : s === sheetCount - 1
          ? 'recover and settle toward idle'
          : 'continue the action beat — no idle reset'
    const poseStory =
      s === 0
        ? 'cells: idle-ready → wind-up → first readable flourish (front-facing)'
        : s === sheetCount - 1
          ? 'cells: continue → second beat / recover → settle near idle stance'
          : 'cells: continue from bridge pose → mid combo → hold readable peak'

    const prompt = [
      `Exact Style A classic sprite chibi pixel-art ACTION ONESHOT SHEET ${id}:`,
      `horizontal strip of exactly ${cellCount} equal cells on one square 1:1 canvas (large cells before downscale).`,
      `Covers global frames ${globalFrames[0]}–${globalFrames[globalFrames.length - 1]} of the Awakening loop.`,
      `Phase: ${phase}. Pose storyboard: ${poseStory}.`,
      `Action intent: ${steps.action}`,
      ``,
      `SAME character as the production plate — ${meta.name}; wardrobe authority = plate pixels.`,
      `Rigid proportions: ~2.5 heads, fixed head size, no stretch. Feet planted. Prop same hand/side as plate.`,
      `Solid ${chromaLabel} background in every cell; ≥6px margin; hard square pixels; no soft bloom.`,
      ``,
      `BRIDGE RULE: do NOT reference the whole prior atlas.`,
      s === 0
        ? `reference_image_paths = [production plate] only.`
        : `reference_image_paths = [production plate, bridge-after-${letters[s - 1]} last cell alone]. Sheet ${id} must CONTINUE from that bridge pose — no idle reset between sheets.`,
      `After accept: split the LAST cell alone to ${jobRoot}/bridge-after-${id}.png via scripts/split-action-sheet-bridge.ps1.`,
    ].join('\n')

    sheets.push({
      id,
      cellCount,
      globalFrames,
      referencePaths,
      bridgeOutPath: `${jobRoot}/bridge-after-${id}.png`,
      prompt,
    })
  }

  const workflow = [
    'DRAFT ONLY — oneshot atlases are not production. Prefer one GenerateImage frame at a time + accept-frame.',
    `Generate sheet A with reference_image_paths = [production plate] only. Chroma: ${chroma}.`,
    'Split the LAST cell alone (never the whole atlas) → bridge-after-A.png (`scripts/split-action-sheet-bridge.ps1`).',
    'Generate sheet B with reference_image_paths = [production plate, bridge-after-A.png] — continue pose, no idle reset.',
    'Repeat split → next sheet; then run each cell through avatar-anim-accept-frame.ps1 before trusting identity.',
  ]

  return { sheets, workflow }
}

export function buildProductionWorkflow(
  animationId: string,
  chroma: AnimationChromaHex,
  plan: AnimationFramePlan,
): string[] {
  const total = totalFrames(plan)
  const actionStart = plan.idle + 1
  const actionEnd = plan.idle + plan.action
  const jobRoot = `tmp/animation-jobs/${animationId}/gi-pilot`
  return [
    `DEFAULT: GenerateImage-only plate-composite pipeline (no ControlNet). Chroma ${chroma}.`,
    `Build idle + return with scripts/avatar-anim-idle-composite.ps1 → ${jobRoot}/seq/ (no AI body).`,
    `For each action frame ${actionStart}–${actionEnd}: GenerateImage with refs [production plate, previous ACCEPTED frame], solid ${chroma} BG, 1–3 concrete deltas only.`,
    `Save raw under ${jobRoot}/raw/fNN.png then run: scripts/avatar-anim-accept-frame.ps1 -Raw … -AcceptedPath ${jobRoot}/seq/fNN.png`,
    'On gate FAIL: regenerate that frame — do not continue the chain.',
    `Optional: fill in-betweens with scripts/avatar-anim-hold-tween.ps1 (petal-only holds from nearest accepted key).`,
    `When seq has all ${total} frames: scripts/process-awakening-strip.ps1 → awakened/{slug}.png`,
    'Oneshot multi-sheet atlases are draft layout only — never production identity.',
  ]
}

export function buildFramePrompt(
  meta: AvatarCharacterMeta,
  frame: number,
  total: number,
  plan: AnimationFramePlan,
  steps: AnimationSteps,
  chroma: AnimationChromaHex = chromaForAvatar(meta).hex,
): string {
  const segment = segmentForFrame(frame, plan)
  const prev = Math.max(1, frame - 1)
  const chromaLabel = chroma === '#00FF00' ? '#00FF00 green' : '#FF00FF magenta'
  const traits = avatarTraits(meta.id)
  const identity = [
    `${meta.name}`,
    traits.hair,
    traits.eyes,
    traits.outfit,
    traits.props,
    traits.aura,
  ].join('; ')

  return [
    `Exact Style A classic sprite chibi pixel-art ACTION FRAME ${frame} of ${total}`,
    `(idle 1-${plan.idle} = plate composite — do not redraw; action ${plan.idle + 1}-${plan.idle + plan.action}; return = composite).`,
    `Tiny delta from the previous ACCEPTED frame only — production plate is the identity authority.`,
    `After this generate: run avatar-anim-accept-frame.ps1 (register + paste head/sash/feet + gates) before the next frame.`,
    ``,
    `SAME character identity — do not redesign: ${identity}`,
    `WARDROBE AUTHORITY: the production plate pixels win — belt/sash, face, shoes will be pasted from the plate after generate.`,
    `Draw motion mainly in limbs, prop tip, and aura chips; keep head size and torso readable as the plate.`,
    `Internal context (do not letter on art): ${meta.inspirationSeries} / ${meta.inspirationCharacter}.`,
    ``,
    `MOTION DELTA FROM FRAME ${prev}: ${frameDeltaHint(frame, plan, steps)}`,
    `SEGMENT: ${segment}.`,
    ``,
    ...animationHardLockLines(prev, chroma),
    ``,
    `REFERENCE ORDER: [1] production plate (identity + wardrobe + feet), [2] previous ACCEPTED frame ${prev} (motion continuity).`,
    `Copy as many unchanged pixels from FRAME ${prev} as possible; only redraw the 1–3px moving parts.`,
    ``,
    `RULES: hard square pixels, dark cool ink outline 1-2px, cel shading, upper-left light,`,
    `front-facing, ~2.5 heads, square canvas (256×256 target), solid ${chromaLabel} background, ≥6px margin,`,
    `no soft bloom, no motion blur, no photo, no UI, no watermark.`,
  ].join('\n')
}

export function buildAnimationJob(animation: AvatarAnimation): AnimationJobPackage {
  const meta = getAvatarCharacterMeta(animation.avatarId)!
  const plan = animation.framePlan
  const total = totalFrames(plan)
  const { hex: chromaHex, reason: chromaReason } = chromaForAvatar(meta)
  const prompts: AnimationJobPackage['prompts'] = []
  const compositeFrames: number[] = []
  const generateImageFrames: number[] = []

  for (let frame = 1; frame <= total; frame++) {
    const segment = segmentForFrame(frame, plan)
    if (segment === 'action') {
      generateImageFrames.push(frame)
      prompts.push({
        frame,
        segment,
        prompt: buildFramePrompt(meta, frame, total, plan, animation.steps, chromaHex),
      })
    } else {
      compositeFrames.push(frame)
    }
  }

  const bridge = buildBridgeSheets(animation.id, meta, plan, animation.steps, chromaHex)
  return {
    animationId: animation.id,
    avatarId: meta.id,
    avatarName: meta.name,
    inspirationSeries: meta.inspirationSeries,
    inspirationCharacter: meta.inspirationCharacter,
    identityLines: avatarIdentityPromptLines(meta.id),
    platePath: `public/avatar-characters/style-a/${meta.assetPath}`,
    steps: animation.steps,
    framePlan: plan,
    totalFrames: total,
    plateLockedFrames: [1, total],
    prompts,
    chromaHex,
    chromaReason,
    compositeFrames,
    generateImageFrames,
    bridgeSheets: bridge?.sheets ?? null,
    productionWorkflow: buildProductionWorkflow(animation.id, chromaHex, plan),
    bridgeWorkflow: bridge?.workflow ?? [
      'Oneshot bridges unused — action length too short for multi-sheet drafts.',
    ],
    processHint:
      `Idle/return: scripts/avatar-anim-idle-composite.ps1. Action: GenerateImage one frame at a time, then scripts/avatar-anim-accept-frame.ps1 (paste + gates, SkipNormalize). Stitch with scripts/process-awakening-strip.ps1 when seq is complete (${chromaHex} chroma, plate-register).`,
  }
}

export function jobPackageMarkdown(job: AnimationJobPackage): string {
  const lines = [
    `# Animation job: ${job.animationId}`,
    ``,
    `- Avatar: **${job.avatarName}** (\`${job.avatarId}\`)`,
    `- Inspiration (internal): ${job.inspirationSeries} / ${job.inspirationCharacter}`,
    `- Plate: \`${job.platePath}\``,
    `- Frames: ${job.totalFrames} (idle ${job.framePlan.idle} / action ${job.framePlan.action} / return ${job.framePlan.return})`,
    `- Plate-locked frames: ${job.plateLockedFrames.join(', ')}`,
    `- Composite frames (no AI body): ${job.compositeFrames.join(', ')}`,
    `- GenerateImage frames: ${job.generateImageFrames.join(', ')}`,
    `- Chroma: \`${job.chromaHex}\` — ${job.chromaReason}`,
    ``,
    `## Steps`,
    ``,
    `### Idle`,
    job.steps.idle,
    ``,
    `### Action`,
    job.steps.action,
    ``,
    `### Return`,
    job.steps.return,
    ``,
    `## Identity`,
    ...job.identityLines.map((l) => `- ${l}`),
    ``,
    `## Production workflow (GenerateImage-only)`,
    ``,
    ...job.productionWorkflow.map((step, i) => `${i + 1}. ${step}`),
    ``,
    `## Action GenerateImage prompts`,
    ``,
    `Refs every time: \`reference_image_paths\` = **[production plate, previous ACCEPTED frame]** (plate first).`,
    `After each generate → \`avatar-anim-accept-frame.ps1\` → only then continue.`,
    `Save raw under \`tmp/animation-jobs/${job.animationId}/gi-pilot/raw/fNN.png\`.`,
    ``,
  ]

  for (const row of job.prompts) {
    lines.push(`### Frame ${row.frame} (${row.segment})`, ``, '```', row.prompt, '```', ``)
  }

  lines.push(
    `## Draft-only: multi-sheet oneshot bridges`,
    ``,
    ...job.bridgeWorkflow.map((step, i) => `${i + 1}. ${step}`),
    ``,
  )

  if (job.bridgeSheets && job.bridgeSheets.length > 0) {
    for (const sheet of job.bridgeSheets) {
      lines.push(
        `#### Draft sheet ${sheet.id} (frames ${sheet.globalFrames.join(', ')})`,
        ``,
        '```',
        sheet.prompt,
        '```',
        ``,
      )
    }
  }

  lines.push(`## Process`, ``, job.processHint, ``)
  return lines.join('\n')
}

export function loadAnimationLibrary(): AvatarAnimation[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAvatarAnimation)
  } catch {
    return []
  }
}

export function saveAnimationLibrary(rows: AvatarAnimation[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function upsertAnimation(row: AvatarAnimation): AvatarAnimation[] {
  const next = loadAnimationLibrary().filter((a) => a.id !== row.id)
  next.push({ ...row, updatedAt: new Date().toISOString() })
  next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  saveAnimationLibrary(next)
  return next
}

export function deleteAnimation(id: string): AvatarAnimation[] {
  const next = loadAnimationLibrary().filter((a) => a.id !== id)
  saveAnimationLibrary(next)
  return next
}

export function animationsForAvatar(avatarId: string): AvatarAnimation[] {
  const id = normalizeEquippedAvatarId(avatarId)
  return loadAnimationLibrary().filter((a) => a.avatarId === id)
}

function isAvatarAnimation(value: unknown): value is AvatarAnimation {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.avatarId === 'string' &&
    typeof row.name === 'string' &&
    row.steps != null &&
    typeof row.steps === 'object'
  )
}

export function downloadTextFile(filename: string, contents: string, mime = 'text/plain'): void {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function avatarPlatePreviewUrl(avatarId: string): string {
  return avatarAssetUrl(avatarId)
}
