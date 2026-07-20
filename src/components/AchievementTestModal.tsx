import { useId, useState } from 'react'
import {
  ACHIEVEMENT_DEFINITIONS,
  type AchievementAward,
  type AchievementDefinition,
} from '../lib/achievements'
import { clearSeenAchievements } from '../lib/achievementUnlocks'
import { resetAccountMenuPressSession } from '../lib/secretEvents'
import {
  CELEBRATION_SOUND_OPTIONS,
  loadCelebrationSoundId,
  playCelebrationSound,
  saveCelebrationSoundId,
  type CelebrationSoundId,
} from '../lib/celebrationSounds'
import { AchievementIcon, achievementCategoryLabel } from './AchievementIcon'
import { Dialog } from './Dialog'

interface AchievementTestModalProps {
  open: boolean
  onClose: () => void
  onPreview: (award: AchievementAward) => void
}

function toAward(def: AchievementDefinition): AchievementAward {
  return {
    id: def.id,
    version: def.version,
    title: def.title,
    description: def.description,
    category: def.category,
    awardedAt: new Date().toISOString(),
    pointReward: def.pointReward,
  }
}

/** DEV-only homepage control to preview milestone unlock popups. */
export function AchievementTestLauncher({
  onPreview,
}: {
  onPreview: (award: AchievementAward) => void
}) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!import.meta.env.DEV) return null

  return (
    <>
      <button
        type="button"
        className="achievement-test-btn"
        onClick={() => {
          setNotice(null)
          setOpen(true)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Test unlocks
      </button>
      <AchievementTestModal
        open={open}
        notice={notice}
        onClose={() => setOpen(false)}
        onPreview={(award) => {
          onPreview(award)
        }}
        onResetSeen={() => {
          clearSeenAchievements()
          resetAccountMenuPressSession()
          setNotice(
            'Seen unlocks cleared and account-chip press streak reset. Click the account button 10 times to re-test Ten Curtain Calls.',
          )
        }}
        onSoundPicked={(label) => {
          setNotice(`Celebration sound set to ${label}. Preview any milestone to hear it.`)
        }}
      />
    </>
  )
}

function AchievementTestModal({
  open,
  onClose,
  onPreview,
  onResetSeen,
  onSoundPicked,
  notice,
}: AchievementTestModalProps & {
  onResetSeen: () => void
  onSoundPicked: (label: string) => void
  notice: string | null
}) {
  const titleId = useId()
  const soundGroupId = useId()
  const [soundId, setSoundId] = useState<CelebrationSoundId>(() => loadCelebrationSoundId())

  if (!import.meta.env.DEV || !open) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      descriptionId="achievement-test-desc"
      backdropClassName="dev-tools-backdrop"
      panelClassName="dev-tools-panel achievement-test-panel"
      closeOnBackdrop
    >
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">Local only</p>
      <h2 id={titleId} className="modal-title">
        Test milestones
      </h2>
      <p id="achievement-test-desc" className="auth-modal-intro">
        Preview the unlock popup for any milestone. The homepage board stays visible behind this
        panel.
      </p>

      <fieldset className="achievement-test-sound" aria-labelledby={soundGroupId}>
        <legend id={soundGroupId} className="achievement-test-sound-legend">
          Celebration sound
        </legend>
        <p className="achievement-test-sound-blurb">
          Used for normal milestones. Hush-Hush secrets play their own themed SFX on unlock.
        </p>
        <ul className="achievement-test-sound-list">
          {CELEBRATION_SOUND_OPTIONS.map((opt) => {
            const selected = soundId === opt.id
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  className={`achievement-test-sound-option${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setSoundId(opt.id)
                    saveCelebrationSoundId(opt.id)
                    void playCelebrationSound(opt.id)
                    onSoundPicked(opt.label)
                  }}
                >
                  <span className="achievement-test-sound-name">{opt.label}</span>
                  <span className="achievement-test-sound-desc">{opt.blurb}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <ul className="achievement-test-list">
        {ACHIEVEMENT_DEFINITIONS.map((def) => (
          <li key={def.id} className={`achievement-test-row achievement-${def.category}`}>
            <span className="achievement-test-seal" aria-hidden="true">
              <AchievementIcon id={def.id} category={def.category} />
            </span>
            <span className="achievement-test-copy">
              <span className="achievement-test-rank">
                {achievementCategoryLabel(def.category)}
              </span>
              <span className="achievement-test-title">{def.title}</span>
            </span>
            <button
              type="button"
              className="btn btn-primary achievement-test-preview"
              onClick={() => onPreview(toAward(def))}
            >
              Preview
            </button>
          </li>
        ))}
      </ul>

      <div className="achievement-test-actions">
        <button type="button" className="btn btn-ghost" onClick={onResetSeen}>
          Reset seen unlocks
        </button>
      </div>
      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}
      <p className="achievement-test-hint">
        Tip: turn on Dev rankings, bump completions/streaks, then save — new titles toast here
        after a reset.
      </p>
    </Dialog>
  )
}
