import { useId } from 'react'
import type { AvatarCharacterMeta } from '../../lib/avatarComposition'
import { toGachaRarity } from '../../lib/gacha'
import { Dialog } from '../Dialog'
import { PixelAvatar } from '../PixelAvatar'

export function GachaWeeklyModal({
  character,
  price,
  copies,
  points,
  busy,
  onClose,
  onBuy,
}: {
  character: AvatarCharacterMeta | null
  price: number
  copies: number
  points: number
  busy: boolean
  onClose: () => void
  onBuy: () => void
}) {
  const titleId = useId()
  if (!character) return null

  const rarity = toGachaRarity(character.rarity)
  const canAfford = points >= price
  const owned = copies > 0
  const buyDisabled = busy || !canAfford

  return (
    <Dialog
      open
      onClose={onClose}
      titleId={titleId}
      descriptionId="gacha-weekly-desc"
      panelClassName={`gacha-weekly-modal is-${rarity}`}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <button
        type="button"
        className="modal-close"
        onClick={onClose}
        aria-label="Close"
        disabled={busy}
      >
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">This week</p>
      <div className="gacha-weekly-modal-art" aria-hidden="true">
        <PixelAvatar characterId={character.id} size="xl" decorative />
        <span className={`gacha-rarity-badge is-${rarity}`}>{rarity}</span>
      </div>
      <h2 id={titleId} className="modal-title">
        {character.name}
      </h2>
      <p id="gacha-weekly-desc" className="gacha-weekly-modal-copy">
        {character.description}
      </p>
      <p className="gacha-weekly-modal-meta" role="status">
        {owned ? `${copies} owned` : 'Not owned yet'}
      </p>
      <div className="modal-actions gacha-weekly-modal-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={buyDisabled}
          data-dialog-initial-focus
          onClick={onBuy}
        >
          {busy
            ? 'Buying…'
            : !canAfford
              ? `Need ◆ ${price}`
              : `Buy ◆ ${price}`}
        </button>
      </div>
      {!canAfford && !busy ? (
        <p className="gacha-weekly-modal-wallet">You have ◆ {points}</p>
      ) : null}
    </Dialog>
  )
}
