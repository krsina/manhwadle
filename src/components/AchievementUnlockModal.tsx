import { useEffect, useId } from 'react'
import type { AchievementAward } from '../lib/achievements'
import { playAchievementUnlockSound } from '../lib/celebrationSounds'
import { AchievementIcon } from './AchievementIcon'
import { ConfettiBurst } from './ConfettiBurst'
import { Dialog } from './Dialog'

interface AchievementUnlockModalProps {
  award: AchievementAward | null
  onClose: () => void
  /** `unlock` celebrates a new title; `detail` is a quieter inspect view. */
  mode?: 'unlock' | 'detail'
}

function formatAwardedAt(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Popup for unlock celebration or badge details. */
export function AchievementUnlockModal({
  award,
  onClose,
  mode = 'unlock',
}: AchievementUnlockModalProps) {
  const titleId = useId()
  const open = award != null
  const isUnlock = mode === 'unlock'
  const awardedLabel = award ? formatAwardedAt(award.awardedAt) : null
  /** Ten Curtain Calls: force reading the unlock (mash can dismiss by accident). */
  const stickyUnlock = isUnlock && award?.id === 'secret_account_menu'

  useEffect(() => {
    if (!award || !isUnlock) return
    void playAchievementUnlockSound(award)
  }, [award?.id, isUnlock])

  if (!award) return null

  const hushHidden = !isUnlock && award.category === 'secret' && !award.awardedAt

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="achievement-unlock-desc"
      panelClassName={`achievement-unlock-panel achievement-${award.category}`}
      backdropChildren={
        isUnlock ? <ConfettiBurst key={award.id} active={open} /> : undefined
      }
      closeOnBackdrop={!stickyUnlock}
      closeOnEscape={!stickyUnlock}
    >
      {!stickyUnlock && (
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      )}

      <p className="achievement-unlock-kicker">
        {isUnlock ? 'Unlocked' : hushHidden ? 'Hush-Hush' : 'Milestone'}
      </p>
      <div
        className={`achievement-unlock-seal${isUnlock ? '' : ' is-static'}`}
        aria-hidden="true"
      >
        <AchievementIcon
          id={hushHidden ? undefined : award.id}
          category={award.category}
        />
      </div>
      <h2 id={titleId} className="achievement-unlock-title">
        {hushHidden ? '???' : award.title}
      </h2>
      <p id="achievement-unlock-desc" className="achievement-unlock-desc">
        {hushHidden ? 'Hidden feat. No spoilers.' : award.description}
      </p>
      {!hushHidden && (
        <p className="achievement-unlock-reward">◆ {award.pointReward} shop points</p>
      )}
      {!isUnlock && awardedLabel && (
        <p className="achievement-unlock-earned">Earned {awardedLabel}</p>
      )}
      {!isUnlock && !awardedLabel && (
        <p className="achievement-unlock-earned">Not earned yet</p>
      )}
      <button
        type="button"
        className="btn btn-primary achievement-unlock-ack"
        onClick={onClose}
        data-dialog-initial-focus={stickyUnlock ? true : undefined}
      >
        {isUnlock ? 'Continue' : 'Close'}
      </button>
    </Dialog>
  )
}
