/**
 * Nested-dialog coordination: only the top dialog owns Escape / scroll lock,
 * and lower layers become inert while a child dialog is open.
 */

export type DialogStackEntry = {
  id: string
  setInert: (inert: boolean) => void
}

const stack: DialogStackEntry[] = []
let scrollLocked = false
let previousOverflow = ''
let previousPaddingRight = ''

function lockBodyScroll(): void {
  if (typeof document === 'undefined' || scrollLocked) return
  const { body } = document
  const scrollbar = window.innerWidth - document.documentElement.clientWidth
  previousOverflow = body.style.overflow
  previousPaddingRight = body.style.paddingRight
  body.style.overflow = 'hidden'
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
  scrollLocked = true
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || !scrollLocked) return
  const { body } = document
  body.style.overflow = previousOverflow
  body.style.paddingRight = previousPaddingRight
  scrollLocked = false
}

function setRootInert(inert: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.getElementById('root')
  if (!root) return
  if (inert) root.setAttribute('inert', '')
  else root.removeAttribute('inert')
}

function refreshStackInert(): void {
  stack.forEach((entry, index) => {
    entry.setInert(index < stack.length - 1)
  })
  setRootInert(stack.length > 0)
}

/** Push a dialog onto the stack. Returns an unregister function. */
export function pushDialog(entry: DialogStackEntry): () => void {
  stack.push(entry)
  if (stack.length === 1) lockBodyScroll()
  refreshStackInert()
  return () => {
    const idx = stack.findIndex((e) => e.id === entry.id)
    if (idx >= 0) stack.splice(idx, 1)
    refreshStackInert()
    if (stack.length === 0) unlockBodyScroll()
  }
}

export function isTopDialog(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1]?.id === id
}

/** Test helper — clear stack between unit tests. */
export function resetDialogStackForTests(): void {
  stack.length = 0
  unlockBodyScroll()
  setRootInert(false)
}
