import { useState, type ReactNode } from 'react'
import { GACHA_UPGRADE_DUPLICATES, type GachaRarity } from '../../lib/gacha'
import { isGachaLabEnabled } from '../../lib/gachaLocalStore'
import { gachaSoundSupported } from '../../lib/gachaSounds'
import { useGachaLocal } from './GachaLocalProvider'

export const GACHA_FORCE_RARITY_OPTIONS: readonly { id: GachaRarity | 'random'; label: string }[] = [
  { id: 'random', label: 'Random' },
  { id: 'common', label: 'Common' },
  { id: 'rare', label: 'Rare' },
  { id: 'epic', label: 'Epic' },
  { id: 'legendary', label: 'Legendary' },
]

export function GachaLab({
  busy = false,
  defaultOpen = false,
  onPreview,
  showGrant = false,
  children,
}: {
  busy?: boolean
  defaultOpen?: boolean
  onPreview?: (rarity?: GachaRarity | null) => void
  showGrant?: boolean
  children?: ReactNode
}) {
  const { snapshot, lastResult, grantLatest, reset, setForceRarity, setSkip, setMuted } =
    useGachaLocal()
  const [open, setOpen] = useState(defaultOpen)

  if (!isGachaLabEnabled()) return null

  return (
    <details
      className="gacha-lab"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Lab</summary>
      <div className="gacha-lab-body">
        <div className="gacha-force-rarity" role="group" aria-label="Force next rarity">
          {GACHA_FORCE_RARITY_OPTIONS.map((option) => {
            const active =
              option.id === 'random' ? snapshot.forceRarity == null : snapshot.forceRarity === option.id
            return (
              <button
                type="button"
                className={`btn btn-ghost${active ? ' is-active' : ''}`}
                disabled={busy}
                key={option.id}
                onClick={() => {
                  const rarity = option.id === 'random' ? null : option.id
                  setForceRarity(rarity)
                  if (onPreview && rarity) onPreview(rarity)
                }}
                aria-pressed={active}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        {onPreview ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onPreview()}>
            Preview roll (free)
          </button>
        ) : null}
        <label className="gacha-skip-toggle">
          <input
            checked={snapshot.skip}
            onChange={(event) => setSkip(event.target.checked)}
            type="checkbox"
          />
          Skip animation
        </label>
        <label className="gacha-skip-toggle">
          <input
            checked={snapshot.muted}
            disabled={!gachaSoundSupported()}
            onChange={(event) => setMuted(event.target.checked)}
            type="checkbox"
          />
          Mute
        </label>
        {showGrant ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!lastResult || busy}
            onClick={() => grantLatest()}
          >
            Grant latest +{GACHA_UPGRADE_DUPLICATES} dupes
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
          Reset
        </button>
        {children}
      </div>
    </details>
  )
}
