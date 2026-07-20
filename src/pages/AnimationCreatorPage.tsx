import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PixelAvatar } from '../components/PixelAvatar'
import {
  animationsForAvatar,
  buildAnimationJob,
  buildDefaultSteps,
  createAnimationDraft,
  deleteAnimation,
  downloadTextFile,
  jobPackageMarkdown,
  loadAnimationLibrary,
  upsertAnimation,
  type AnimationStepId,
  type AvatarAnimation,
} from '../lib/avatarAnimation'
import {
  AVATAR_CHARACTER_META,
  avatarAssetUrl,
  normalizeEquippedAvatarId,
} from '../lib/avatarComposition'
import { HOME_PATH } from '../lib/routes'

/**
 * Dev-only Animation Creator: avatar library + idle/action/return specs.
 * Generate exports a Cursor job package (JSON + markdown); frames are produced by the agent.
 */
export function AnimationCreatorPage() {
  if (!import.meta.env.DEV) {
    return (
      <main className="animation-creator">
        <h1>Animation Creator</h1>
        <p>This tool is only available in local development builds.</p>
        <p>
          <Link to={HOME_PATH}>← Home</Link>
        </p>
      </main>
    )
  }

  return <AnimationCreatorApp />
}

function AnimationCreatorApp() {
  const [library, setLibrary] = useState(() => loadAnimationLibrary())
  const [avatarId, setAvatarId] = useState(normalizeEquippedAvatarId('avatar_plum_blossom_blade'))
  const [selectedAnimId, setSelectedAnimId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const meta = AVATAR_CHARACTER_META.find((row) => row.id === avatarId)!
  const avatarAnims = useMemo(
    () => library.filter((row) => row.avatarId === avatarId),
    [library, avatarId],
  )
  const selected =
    avatarAnims.find((row) => row.id === selectedAnimId) ?? avatarAnims[0] ?? null

  function refresh(next: AvatarAnimation[]) {
    setLibrary(next)
  }

  function selectAvatar(id: string) {
    setAvatarId(id)
    const first = animationsForAvatar(id)[0]
    setSelectedAnimId(first?.id ?? null)
    setNotice(null)
  }

  function handleCreate() {
    const draft = createAnimationDraft(avatarId)
    refresh(upsertAnimation(draft))
    setSelectedAnimId(draft.id)
    setNotice(`Created “${draft.name}”. Edit steps or press Generate for a Cursor job package.`)
  }

  function patchSelected(patch: Partial<AvatarAnimation>) {
    if (!selected) return
    const next = { ...selected, ...patch, updatedAt: new Date().toISOString() }
    refresh(upsertAnimation(next))
    setSelectedAnimId(next.id)
  }

  function patchStep(step: AnimationStepId, value: string) {
    if (!selected) return
    patchSelected({ steps: { ...selected.steps, [step]: value }, status: 'draft' })
  }

  function handleDefaults() {
    if (!selected) return
    patchSelected({ steps: buildDefaultSteps(avatarId), status: 'draft' })
    setNotice('Restored idle / action / return defaults from avatar inspiration context.')
  }

  function handleDelete() {
    if (!selected) return
    const next = deleteAnimation(selected.id)
    refresh(next)
    setSelectedAnimId(next.find((row) => row.avatarId === avatarId)?.id ?? null)
    setNotice('Animation removed from the local library.')
  }

  function handleGenerate() {
    if (!selected) return
    const ready = {
      ...selected,
      status: 'spec_ready' as const,
      updatedAt: new Date().toISOString(),
    }
    refresh(upsertAnimation(ready))
    const job = buildAnimationJob(ready)
    downloadTextFile(`${ready.id}.job.json`, JSON.stringify(job, null, 2), 'application/json')
    downloadTextFile(`${ready.id}.PROMPTS.md`, jobPackageMarkdown(job), 'text/markdown')
    setNotice(
      `Exported job package for Cursor. Save under tmp/animation-jobs/${ready.id}/ then generate frames sequentially (plate-lock f01 + last).`,
    )
  }

  return (
    <main className="animation-creator">
      <header className="animation-creator-header">
        <p className="modal-kicker">Dev only</p>
        <h1>Animation Creator</h1>
        <p>
          Spec idle → action → return loops with manhwa/character context. Generate downloads a
          Cursor job package — frames are produced the same way as in chat (sequential Style A
          plates), then stitched with the robe-safe processor.
        </p>
        <p>
          <Link to={HOME_PATH}>← Home</Link>
        </p>
      </header>

      {notice && (
        <p className="animation-creator-notice" role="status">
          {notice}
        </p>
      )}

      <div className="animation-creator-layout">
        <section className="animation-creator-avatars" aria-label="Avatar library">
          <h2>Avatars</h2>
          <ul className="animation-creator-avatar-grid">
            {AVATAR_CHARACTER_META.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`animation-creator-avatar-card${
                    row.id === avatarId ? ' is-selected' : ''
                  }`}
                  onClick={() => selectAvatar(row.id)}
                >
                  <img src={avatarAssetUrl(row.id)} alt="" width={64} height={64} />
                  <span>{row.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="animation-creator-anims" aria-label="Animation library">
          <div className="animation-creator-anims-head">
            <h2>Animations</h2>
            <button type="button" className="btn btn-primary" onClick={handleCreate}>
              New
            </button>
          </div>
          <p className="animation-creator-context">
            <strong>{meta.name}</strong>
            <br />
            Internal: {meta.inspirationSeries} / {meta.inspirationCharacter}
          </p>
          {avatarAnims.length === 0 ? (
            <p className="animation-creator-empty">No animations yet. Create one to start.</p>
          ) : (
            <ul className="animation-creator-anim-list">
              {avatarAnims.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`animation-creator-anim-card${
                      selected?.id === row.id ? ' is-selected' : ''
                    }`}
                    onClick={() => setSelectedAnimId(row.id)}
                  >
                    <span>{row.name}</span>
                    <span className="animation-creator-status">{row.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="animation-creator-editor" aria-label="Step editor">
          <h2>Steps</h2>
          {!selected ? (
            <p className="animation-creator-empty">Select or create an animation.</p>
          ) : (
            <>
              <div className="animation-creator-preview avatar-stage-well">
                <PixelAvatar characterId={avatarId} size="xl" />
              </div>
              <label className="animation-creator-field">
                Name
                <input
                  value={selected.name}
                  onChange={(e) => patchSelected({ name: e.target.value, status: 'draft' })}
                />
              </label>
              {(['idle', 'action', 'return'] as const).map((step) => (
                <label key={step} className="animation-creator-field">
                  {step === 'idle' ? '1. Idle' : step === 'action' ? '2. Action' : '3. Return to idle'}
                  <textarea
                    rows={4}
                    value={selected.steps[step]}
                    onChange={(e) => patchStep(step, e.target.value)}
                  />
                </label>
              ))}
              <p className="animation-creator-plan">
                Frame plan: {selected.framePlan.idle} idle + {selected.framePlan.action} action +{' '}
                {selected.framePlan.return} return (
                {selected.framePlan.idle + selected.framePlan.action + selected.framePlan.return}{' '}
                total). Frames 1 and last stay plate-locked.
              </p>
              <div className="animation-creator-actions">
                <button type="button" className="btn btn-ghost" onClick={handleDefaults}>
                  Use defaults
                </button>
                <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                  Generate job package
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleDelete}>
                  Delete
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
