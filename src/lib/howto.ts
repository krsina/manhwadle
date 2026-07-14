/** Mode-agnostic how-to content. Each mode supplies its own guide. */
export interface HowToPlayStep {
  /** Short step heading */
  title: string
  /** One or two sentences of explanation */
  body: string
}

export interface HowToPlayGuide {
  /** Modal title, e.g. "How to play" */
  title: string
  /** Optional one-line intro under the title */
  intro?: string
  steps: HowToPlayStep[]
  /** Optional closing note */
  footer?: string
}

const STORAGE_PREFIX = 'manhwadle:howto:seen:'

export function howToSeenKey(modeId: string): string {
  return STORAGE_PREFIX + modeId
}

export function hasSeenHowTo(modeId: string): boolean {
  try {
    return localStorage.getItem(howToSeenKey(modeId)) === '1'
  } catch {
    return false
  }
}

export function markHowToSeen(modeId: string): void {
  try {
    localStorage.setItem(howToSeenKey(modeId), '1')
  } catch {
    // Ignore quota / private mode failures
  }
}
