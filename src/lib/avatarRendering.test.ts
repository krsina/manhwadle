import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Style A avatar rendering styles', () => {
  it('uses nearest-neighbor pixel rendering for the character PNG', () => {
    const styles = fs.readFileSync(path.resolve('src/styles.css'), 'utf8')
    expect(styles).toContain('image-rendering: pixelated')
    expect(styles).toContain('image-rendering: crisp-edges')
    expect(styles).toContain('.pixel-avatar.is-bust')
    expect(styles).toContain('.pixel-avatar-img')
    expect(styles).toContain('.pixel-avatar img')
    expect(styles).toContain('var(--avatar-bust-x')
    expect(styles).toContain('var(--avatar-bust-y')
    expect(styles).toContain('var(--avatar-bust-scale')
  })
  it('does not assume a stacked-layer or SVG avatar compositor', () => {
    const styles = fs.readFileSync(path.resolve('src/styles.css'), 'utf8')
    const avatarBlock = styles.slice(styles.indexOf('.pixel-avatar {'))
    expect(avatarBlock).not.toMatch(/\.pixel-avatar[^{]*\{[^}]*svg/i)
    expect(styles).not.toContain('pixel-avatar-svg')
    expect(styles).not.toContain('pixel-avatar-stack')
    expect(styles).not.toContain('pixel-avatar-layer')
    expect(styles).not.toMatch(/\.pixel-avatar-img[^{]*\{[^}]*image-rendering:\s*auto/s)
  })

  it('wires Style A stage wells behind home and shop character frames', () => {
    const styles = fs.readFileSync(path.resolve('src/styles.css'), 'utf8')
    expect(styles).toContain('.avatar-stage-well')
    expect(styles).toContain('var(--avatar-stage-url)')
    expect(styles).toContain('background-position: center bottom')
    expect(styles).not.toMatch(
      /\.avatar-stage-well\s*\{[^}]*url\('\/avatar-stages\/style-a\/blossom-courtyard\.png/s,
    )
  })

  it('has no leftover awakening sprite-sheet or idle FX styles', () => {
    const styles = fs.readFileSync(path.resolve('src/styles.css'), 'utf8')
    expect(styles).not.toContain('.pixel-avatar-sheet-window')
    expect(styles).not.toContain('.pixel-avatar-sheet-strip')
    expect(styles).not.toContain('.avatar-awakenings')
    expect(styles).not.toContain('animation-name: avatar-sheet-steps')
    expect(styles).not.toContain('@keyframes avatar-sheet-steps')
    expect(styles).not.toContain('@keyframes avatar-idle-bob')
    expect(styles).not.toContain('@keyframes avatar-idle-flex')
    expect(styles).not.toContain('@keyframes avatar-fx-drift')
    expect(styles).not.toContain('.pixel-avatar-aura')
    expect(styles).not.toContain('--avatar-sheet-frames')
    expect(styles).not.toContain("[data-fx='embers']")
  })
})
