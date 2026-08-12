import type { CSSProperties } from 'react'
import { getVersusEffect, type VersusEffectId } from '../../lib/versusEffects'

interface VersusEffectLayerProps {
  effect: VersusEffectId
  active?: boolean
  compact?: boolean
  message?: string
}

const PARTICLES = Array.from({ length: 18 }, (_, index) => index)

function EffectGlyph({ effect }: { effect: VersusEffectId }) {
  if (effect === 'match-victory') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="m9 20 13 10 10-18 10 18 13-10-5 29H14L9 20Z" />
        <path d="M16 55h32" />
      </svg>
    )
  }
  if (effect === 'timeout') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="34" r="20" />
        <path d="M25 8h14M32 14v20l10 7" />
      </svg>
    )
  }
  if (effect === 'score-change') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 47 29 30l9 9 14-20M39 19h13v13" />
      </svg>
    )
  }
  if (effect === 'match-draw') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M11 23h42M11 41h42" />
      </svg>
    )
  }
  if (effect === 'round-loss' || effect === 'incorrect-guess' || effect === 'match-defeat') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="m17 17 30 30M47 17 17 47" />
      </svg>
    )
  }
  if (effect === 'opponent-solved') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="25" r="10" />
        <path d="M14 53c2-11 8-17 18-17s16 6 18 17M47 12l4 4 7-8" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="m12 34 13 13 28-31" />
    </svg>
  )
}

/** Self-contained visual cue that can be mounted over a Versus board or result panel. */
export function VersusEffectLayer({
  effect,
  active = true,
  compact = false,
  message,
}: VersusEffectLayerProps) {
  if (!active) return null
  const definition = getVersusEffect(effect)
  const displayMessage = message ?? definition.message
  const particles =
    effect === 'round-win' ||
    effect === 'match-victory' ||
    effect === 'score-change'

  return (
    <div
      className={`versus-effect-layer is-${effect} is-${definition.tone}${
        compact ? ' is-compact' : ''
      }`}
      aria-hidden="true"
    >
      <div className="versus-effect-vignette" />
      <div className="versus-effect-scan" />
      <div className="versus-effect-ring is-ring-one" />
      <div className="versus-effect-ring is-ring-two" />
      {particles && (
        <div className="versus-effect-particles">
          {PARTICLES.map((particle) => (
            <i key={particle} style={{ '--particle': particle } as CSSProperties} />
          ))}
        </div>
      )}
      <div className="versus-effect-card">
        {effect === 'countdown' ? (
          <strong className="versus-effect-count">{displayMessage}</strong>
        ) : (
          <span className="versus-effect-glyph">
            <EffectGlyph effect={effect} />
          </span>
        )}
        <small>{definition.eyebrow}</small>
        <strong>{displayMessage}</strong>
        {effect === 'score-change' && <b className="versus-effect-points">+1,250</b>}
      </div>
    </div>
  )
}
