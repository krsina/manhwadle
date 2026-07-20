import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * Arrow-key navigation for role="tablist" / role="tab" widgets.
 */

export function focusTabByOffset(
  tabs: HTMLElement[],
  current: HTMLElement,
  offset: number,
): void {
  if (tabs.length === 0) return
  const index = tabs.indexOf(current)
  if (index < 0) return
  const next = tabs[(index + offset + tabs.length) % tabs.length]
  next?.focus()
  next?.click()
}

/** Handle ArrowLeft/Right/Home/End on a horizontal tablist. */
export function handleTabListKeyDown(
  event: KeyboardEvent | ReactKeyboardEvent,
  tablist: HTMLElement,
): void {
  const key = event.key
  if (
    key !== 'ArrowLeft' &&
    key !== 'ArrowRight' &&
    key !== 'Home' &&
    key !== 'End'
  ) {
    return
  }

  const tabs = Array.from(
    tablist.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'),
  )
  if (tabs.length === 0) return

  const current =
    event.target instanceof HTMLElement && event.target.getAttribute('role') === 'tab'
      ? event.target
      : (tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0]!)

  event.preventDefault()

  if (key === 'Home') {
    tabs[0]?.focus()
    tabs[0]?.click()
    return
  }
  if (key === 'End') {
    const last = tabs[tabs.length - 1]
    last?.focus()
    last?.click()
    return
  }

  focusTabByOffset(tabs, current, key === 'ArrowRight' ? 1 : -1)
}
