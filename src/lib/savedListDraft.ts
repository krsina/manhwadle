import { SAVED_LIST_MAX_NAME_LENGTH, SAVED_LIST_MIN_ENTRIES } from './savedListsApi'

export interface SavedListDraft {
  name: string
  entryCount: number
}

export interface SavedListDraftIssue {
  field: 'name' | 'entries'
  message: string
}

/**
 * Why a draft cannot be saved yet, phrased for the save bar. Returning a
 * reason instead of silently disabling the button keeps the blocker visible.
 */
export function savedListDraftIssue(draft: SavedListDraft): SavedListDraftIssue | null {
  const name = draft.name.trim()
  if (name.length < 1) {
    return { field: 'name', message: 'Name your list before saving.' }
  }
  if (name.length > SAVED_LIST_MAX_NAME_LENGTH) {
    return {
      field: 'name',
      message: `Names are limited to ${SAVED_LIST_MAX_NAME_LENGTH} characters.`,
    }
  }
  if (draft.entryCount < SAVED_LIST_MIN_ENTRIES) {
    const missing = SAVED_LIST_MIN_ENTRIES - draft.entryCount
    return {
      field: 'entries',
      message: `Pick ${missing} more title${missing === 1 ? '' : 's'} before saving.`,
    }
  }
  return null
}

export function savedListProgress(entryCount: number): string {
  if (entryCount >= SAVED_LIST_MIN_ENTRIES) {
    return `${entryCount} title${entryCount === 1 ? '' : 's'} ready to save`
  }
  const missing = SAVED_LIST_MIN_ENTRIES - entryCount
  return `${missing} more title${missing === 1 ? '' : 's'} to go`
}
