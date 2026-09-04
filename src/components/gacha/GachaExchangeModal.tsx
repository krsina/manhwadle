import { useCallback, useEffect, useId, useState } from 'react'
import type { GachaRollResult } from '../../lib/gacha'
import { Dialog } from '../Dialog'
import { GachaRevealStage } from './GachaRevealStage'

export function GachaExchangeModal({
  result,
  playId,
  skip,
  muted = false,
  sourceName,
  onClose,
}: {
  result: GachaRollResult | null
  playId: number
  skip: boolean
  muted?: boolean
  sourceName: string
  onClose: () => void
}) {
  const titleId = useId()
  const open = result != null
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    if (!open) return
    setLanded(false)
  }, [open, playId])

  const handleComplete = useCallback(() => {
    setLanded(true)
  }, [])

  if (!result) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="gacha-exchange-desc"
      panelClassName={`gacha-exchange-modal is-${result.rarity}`}
      closeOnBackdrop={landed}
      closeOnEscape={landed}
    >
      <p className="modal-kicker">Exchange</p>
      <h2 id={titleId} className="modal-title">
        {landed ? result.character.name : 'Rolling…'}
      </h2>
      <p id="gacha-exchange-desc" className="gacha-exchange-modal-copy">
        {landed
          ? `Spent 5 ${sourceName} copies. Points and pity were unchanged.`
          : `Spending 5 ${sourceName} copies…`}
      </p>
      <GachaRevealStage
        muted={muted}
        onComplete={handleComplete}
        playId={playId}
        result={result}
        skip={skip}
      />
      {landed ? (
        <div className="gacha-exchange-modal-actions">
          <div className="gacha-exchange-modal-meta">
            <p className={`gacha-rarity-badge is-${result.rarity}`}>{result.rarity}</p>
            <p className="gacha-result-flag">{result.isNew ? 'New' : 'Already owned'}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            data-dialog-initial-focus
            onClick={onClose}
          >
            Continue
          </button>
        </div>
      ) : null}
    </Dialog>
  )
}
