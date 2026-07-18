import { describe, expect, it, afterEach } from 'vitest'
import {
  isTopDialog,
  pushDialog,
  resetDialogStackForTests,
} from './dialogStack'

afterEach(() => {
  resetDialogStackForTests()
})

describe('dialogStack', () => {
  it('tracks nested dialogs and only the top id is active', () => {
    const a = { id: 'a', setInert: () => undefined }
    const b = { id: 'b', setInert: () => undefined }
    const popA = pushDialog(a)
    expect(isTopDialog('a')).toBe(true)
    const popB = pushDialog(b)
    expect(isTopDialog('a')).toBe(false)
    expect(isTopDialog('b')).toBe(true)
    popB()
    expect(isTopDialog('a')).toBe(true)
    popA()
    expect(isTopDialog('a')).toBe(false)
  })
})
