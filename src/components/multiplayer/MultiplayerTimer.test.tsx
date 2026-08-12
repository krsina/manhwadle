import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MultiplayerTimer } from './MultiplayerTimer'

describe('MultiplayerTimer', () => {
  it('renders the compact inline time and accessible label', () => {
    const html = renderToStaticMarkup(
      <MultiplayerTimer
        endsAt="2026-08-12T10:01:43Z"
        serverNow="2026-08-12T10:01:00Z"
        label="Time left:"
        durationMs={180_000}
      />,
    )
    expect(html).toContain('multiplayer-timer-inline')
    expect(html).toContain('aria-label="Time left: 0:43"')
    expect(html).toContain('>0:43<')
  })

  it('applies warning and critical states only to long phases', () => {
    const warning = renderToStaticMarkup(
      <MultiplayerTimer
        endsAt="2026-08-12T10:00:25Z"
        serverNow="2026-08-12T10:00:00Z"
        label="Time left:"
        durationMs={180_000}
      />,
    )
    const critical = renderToStaticMarkup(
      <MultiplayerTimer
        endsAt="2026-08-12T10:00:08Z"
        serverNow="2026-08-12T10:00:00Z"
        label="Time left:"
        durationMs={180_000}
      />,
    )
    const shortPhase = renderToStaticMarkup(
      <MultiplayerTimer
        endsAt="2026-08-12T10:00:02Z"
        serverNow="2026-08-12T10:00:00Z"
        label="Starts in"
        durationMs={3_000}
      />,
    )
    expect(warning).toContain('is-warning')
    expect(critical).toContain('is-critical')
    expect(shortPhase).not.toContain('is-warning')
    expect(shortPhase).not.toContain('is-critical')
  })

  it('uses a seconds-only hero readout below one minute', () => {
    const html = renderToStaticMarkup(
      <MultiplayerTimer
        endsAt="2026-08-12T10:00:03Z"
        serverNow="2026-08-12T10:00:00Z"
        label="Starts in"
        durationMs={3_000}
        variant="hero"
      />,
    )
    expect(html).toContain('multiplayer-timer-hero')
    expect(html).toContain('>3<')
  })
})
