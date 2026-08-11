/**
 * Per-avatar bust crop for Style A `sm` portraits (Versus, leaderboard, auth).
 * Committed baselines live here; local DEV drafts can override via localStorage.
 */

import { normalizeEquippedAvatarId } from './avatarComposition'

export interface AvatarBustCrop {
  /** Horizontal focus percent (0–100). */
  focusX: number
  /** Vertical focus percent (0–100); lower = head higher in frame. */
  focusY: number
  /** Zoom multiplier applied to the plate inside the bust box. */
  scale: number
}

export const DEFAULT_AVATAR_BUST_CROP: AvatarBustCrop = {
  focusX: 50,
  focusY: 18,
  scale: 2.55,
}

/** Committed per-avatar overrides (only store deltas from the default). */
export const AVATAR_BUST_CROPS: Readonly<Record<string, Partial<AvatarBustCrop>>> = {
  // Add tuned outliers here after editing in /dev/avatar-bust-crops
}

export const AVATAR_BUST_CROPS_EVENT = 'manhwadle:avatar-bust-crops'
export const AVATAR_BUST_CROPS_STORAGE_KEY = 'manhwadle:avatar-bust-crops'

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function normalizeAvatarBustCrop(
  raw: Partial<AvatarBustCrop> | null | undefined,
  fallback: AvatarBustCrop = DEFAULT_AVATAR_BUST_CROP,
): AvatarBustCrop {
  return {
    focusX: clamp(raw?.focusX ?? fallback.focusX, 0, 100),
    focusY: clamp(raw?.focusY ?? fallback.focusY, 0, 100),
    scale: clamp(raw?.scale ?? fallback.scale, 1.2, 4.5),
  }
}

function readDraftMap(): Record<string, Partial<AvatarBustCrop>> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(AVATAR_BUST_CROPS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, Partial<AvatarBustCrop>> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const row = value as Record<string, unknown>
      const partial: Partial<AvatarBustCrop> = {}
      if (typeof row.focusX === 'number') partial.focusX = row.focusX
      if (typeof row.focusY === 'number') partial.focusY = row.focusY
      if (typeof row.scale === 'number') partial.scale = row.scale
      if (Object.keys(partial).length > 0) out[id] = partial
    }
    return out
  } catch {
    return {}
  }
}

let draftCache: Record<string, Partial<AvatarBustCrop>> | null = null

function drafts(): Record<string, Partial<AvatarBustCrop>> {
  if (draftCache == null) draftCache = readDraftMap()
  return draftCache
}

function notifyBustCropsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AVATAR_BUST_CROPS_EVENT))
}

/** Resolved crop for an avatar id (draft overrides committed overrides default). */
export function getAvatarBustCrop(characterId: string | null | undefined): AvatarBustCrop {
  const id = normalizeEquippedAvatarId(characterId)
  return normalizeAvatarBustCrop({
    ...AVATAR_BUST_CROPS[id],
    ...drafts()[id],
  })
}

export function getAvatarBustCropDraft(
  characterId: string | null | undefined,
): Partial<AvatarBustCrop> | null {
  const id = normalizeEquippedAvatarId(characterId)
  return drafts()[id] ?? null
}

export function listAvatarBustCropDrafts(): Record<string, Partial<AvatarBustCrop>> {
  return { ...drafts() }
}

/** Persist a draft override for local preview; pass null to clear that avatar's draft. */
export function setAvatarBustCropDraft(
  characterId: string | null | undefined,
  crop: Partial<AvatarBustCrop> | null,
): AvatarBustCrop {
  const id = normalizeEquippedAvatarId(characterId)
  const next = { ...drafts() }
  if (crop == null) {
    delete next[id]
  } else {
    const resolved = normalizeAvatarBustCrop({
      ...AVATAR_BUST_CROPS[id],
      ...crop,
    })
    const committed = normalizeAvatarBustCrop(AVATAR_BUST_CROPS[id])
    const partial: Partial<AvatarBustCrop> = {}
    if (resolved.focusX !== committed.focusX) partial.focusX = resolved.focusX
    if (resolved.focusY !== committed.focusY) partial.focusY = resolved.focusY
    if (resolved.scale !== committed.scale) partial.scale = resolved.scale
    if (Object.keys(partial).length === 0) delete next[id]
    else next[id] = partial
  }
  draftCache = next
  if (typeof localStorage !== 'undefined') {
    try {
      if (Object.keys(next).length === 0) localStorage.removeItem(AVATAR_BUST_CROPS_STORAGE_KEY)
      else localStorage.setItem(AVATAR_BUST_CROPS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore quota */
    }
  }
  notifyBustCropsChanged()
  return getAvatarBustCrop(id)
}

export function clearAvatarBustCropDrafts(): void {
  draftCache = {}
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(AVATAR_BUST_CROPS_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  notifyBustCropsChanged()
}

/** Merge committed + drafts into a pasteable TypeScript object literal body. */
export function formatAvatarBustCropsTypeScript(
  extraDrafts: Record<string, Partial<AvatarBustCrop>> = drafts(),
): string {
  const merged: Record<string, AvatarBustCrop> = {}
  for (const id of new Set([
    ...Object.keys(AVATAR_BUST_CROPS),
    ...Object.keys(extraDrafts),
  ])) {
    const crop = normalizeAvatarBustCrop({
      ...AVATAR_BUST_CROPS[id],
      ...extraDrafts[id],
    })
    const baseline = DEFAULT_AVATAR_BUST_CROP
    if (
      crop.focusX === baseline.focusX &&
      crop.focusY === baseline.focusY &&
      crop.scale === baseline.scale
    ) {
      continue
    }
    merged[id] = crop
  }

  const ids = Object.keys(merged).sort()
  if (ids.length === 0) {
    return 'export const AVATAR_BUST_CROPS: Readonly<Record<string, Partial<AvatarBustCrop>>> = {\n  // no overrides\n}\n'
  }

  const lines = ids.map((id) => {
    const crop = merged[id]!
    return `  ${id}: { focusX: ${crop.focusX}, focusY: ${crop.focusY}, scale: ${crop.scale} },`
  })
  return [
    'export const AVATAR_BUST_CROPS: Readonly<Record<string, Partial<AvatarBustCrop>>> = {',
    ...lines,
    '}',
    '',
  ].join('\n')
}

export function avatarBustCropStyle(
  characterId: string | null | undefined,
): Record<string, string> {
  const crop = getAvatarBustCrop(characterId)
  return {
    '--avatar-bust-x': `${crop.focusX}%`,
    '--avatar-bust-y': `${crop.focusY}%`,
    '--avatar-bust-scale': String(crop.scale),
  }
}

/** Test helper. */
export function resetAvatarBustCropDraftCacheForTests(): void {
  draftCache = null
}
