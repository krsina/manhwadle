/** DEV-only toggles for ResultModal demo features. */

export interface ResultModalDemoFlags {
  /** Wordle-style emoji grid under the score */
  emojiGrid: boolean
  /** Current / max streak under the score */
  streakStrip: boolean
  /** Share text preview + inline Copied!/Shared! feedback */
  sharePolish: boolean
  /** Score+grid cluster, outcome tint, tap grid to share */
  shareCluster: boolean
}

export const DEFAULT_RESULT_MODAL_DEMO_FLAGS: ResultModalDemoFlags = {
  emojiGrid: false,
  streakStrip: false,
  sharePolish: false,
  shareCluster: false,
}

const STORAGE_KEY = 'manhwadle:dev:result-modal-demo'
const CHANGE_EVENT = 'manhwadle:result-modal-demo'

function isDev(): boolean {
  return Boolean(import.meta.env.DEV)
}

export function loadResultModalDemoFlags(): ResultModalDemoFlags {
  if (!isDev() || typeof localStorage === 'undefined') {
    return { ...DEFAULT_RESULT_MODAL_DEMO_FLAGS }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_RESULT_MODAL_DEMO_FLAGS }
    const parsed = JSON.parse(raw) as Partial<ResultModalDemoFlags>
    return {
      emojiGrid: Boolean(parsed.emojiGrid),
      streakStrip: Boolean(parsed.streakStrip),
      sharePolish: Boolean(parsed.sharePolish),
      shareCluster: Boolean(parsed.shareCluster),
    }
  } catch {
    return { ...DEFAULT_RESULT_MODAL_DEMO_FLAGS }
  }
}

export function saveResultModalDemoFlags(flags: ResultModalDemoFlags): void {
  if (!isDev() || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore */
  }
}

export function subscribeResultModalDemoFlags(onChange: () => void): () => void {
  if (!isDev() || typeof window === 'undefined') return () => {}
  const handler = () => onChange()
  window.addEventListener(CHANGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
