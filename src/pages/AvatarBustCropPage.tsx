import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { PixelAvatar } from '../components/PixelAvatar'
import {
  AVATAR_CHARACTER_META,
  DEFAULT_AVATAR_ID,
  describeAvatar,
} from '../lib/avatarComposition'
import {
  clearAvatarBustCropDrafts,
  DEFAULT_AVATAR_BUST_CROP,
  formatAvatarBustCropsTypeScript,
  getAvatarBustCrop,
  getAvatarBustCropDraft,
  setAvatarBustCropDraft,
  type AvatarBustCrop,
} from '../lib/avatarBustCrop'
import {
  AVATAR_STAGE_META,
  avatarStageCssUrl,
  DEFAULT_STAGE_ID,
} from '../lib/avatarStages'
import { HOME_PATH, VERSUS_PATH } from '../lib/routes'

function stageStyleFor(stageId: string): CSSProperties {
  return {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(stageId),
  }
}

/**
 * Local DEV / owner tool: tune Style A bust crops with live homepage + Versus previews.
 * Drafts save to localStorage; copy the TypeScript map to commit baselines.
 */
export function AvatarBustCropPage() {
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID)
  const [stageId, setStageId] = useState(DEFAULT_STAGE_ID)
  const [crop, setCrop] = useState<AvatarBustCrop>(() => getAvatarBustCrop(DEFAULT_AVATAR_ID))
  const [notice, setNotice] = useState<string | null>(null)
  const [exportText, setExportText] = useState(() => formatAvatarBustCropsTypeScript())

  const avatarMeta = useMemo(
    () => AVATAR_CHARACTER_META.find((row) => row.id === avatarId) ?? null,
    [avatarId],
  )
  const hasDraft = Boolean(getAvatarBustCropDraft(avatarId))
  const stageStyle = stageStyleFor(stageId)

  function selectAvatar(id: string) {
    setAvatarId(id)
    setCrop(getAvatarBustCrop(id))
    setNotice(null)
  }

  function updateCrop(partial: Partial<AvatarBustCrop>) {
    const next = setAvatarBustCropDraft(avatarId, { ...crop, ...partial })
    setCrop(next)
    setExportText(formatAvatarBustCropsTypeScript())
    setNotice(null)
  }

  function resetSelected() {
    const next = setAvatarBustCropDraft(avatarId, null)
    setCrop(next)
    setExportText(formatAvatarBustCropsTypeScript())
    setNotice(`Cleared draft for ${describeAvatar(avatarId)}.`)
  }

  function resetAll() {
    clearAvatarBustCropDrafts()
    setCrop(getAvatarBustCrop(avatarId))
    setExportText(formatAvatarBustCropsTypeScript())
    setNotice('Cleared all local bust crop drafts.')
  }

  async function copyExport() {
    const text = formatAvatarBustCropsTypeScript()
    setExportText(text)
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Copied TypeScript map. Paste into src/lib/avatarBustCrop.ts.')
    } catch {
      setNotice('Clipboard blocked — copy from the export box below.')
    }
  }

  return (
    <main className="bust-crop-page">
      <header className="bust-crop-hero">
        <div>
          <p className="shop-kicker">DEV / owner</p>
          <h1>Avatar bust crops</h1>
          <p className="bust-crop-lead">
            Tune head/upper-torso framing for bust portraits on stage backgrounds. Previews mirror
            Versus roster, home character card, leaderboard row, and header chip.
          </p>
        </div>
        <div className="bust-crop-hero-actions">
          <Link className="btn" to={HOME_PATH}>
            Home
          </Link>
          <Link className="btn" to={VERSUS_PATH}>
            Versus
          </Link>
        </div>
      </header>

      <div className="bust-crop-layout">
        <section className="bust-crop-picker" aria-label="Avatar picker">
          <h2>Avatars</h2>
          <div className="bust-crop-picker-grid">
            {AVATAR_CHARACTER_META.map((character) => {
              const selected = character.id === avatarId
              return (
                <button
                  key={character.id}
                  type="button"
                  className={`bust-crop-picker-card${selected ? ' is-selected' : ''}`}
                  onClick={() => selectAvatar(character.id)}
                >
                  <span
                    className="multiplayer-player-portrait avatar-stage-well"
                    style={stageStyle}
                    aria-hidden="true"
                  >
                    <PixelAvatar
                      characterId={character.id}
                      size="sm"
                      decorative
                      className="multiplayer-player-avatar"
                    />
                  </span>
                  <span className="bust-crop-picker-name">{character.name}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="bust-crop-editor" aria-label="Crop controls">
          <div className="bust-crop-editor-head">
            <div>
              <h2>{avatarMeta?.name ?? describeAvatar(avatarId)}</h2>
              <p className="versus-muted">{avatarId}{hasDraft ? ' · draft' : ''}</p>
            </div>
            <label className="versus-field bust-crop-stage-field">
              Stage banner
              <select
                value={stageId}
                onChange={(event) => setStageId(event.target.value)}
              >
                {AVATAR_STAGE_META.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="bust-crop-sliders">
            <label className="versus-field">
              Focus X ({crop.focusX.toFixed(0)}%)
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={crop.focusX}
                onChange={(event) => updateCrop({ focusX: Number(event.target.value) })}
              />
            </label>
            <label className="versus-field">
              Focus Y ({crop.focusY.toFixed(0)}%)
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={crop.focusY}
                onChange={(event) => updateCrop({ focusY: Number(event.target.value) })}
              />
            </label>
            <label className="versus-field">
              Scale ({crop.scale.toFixed(2)})
              <input
                type="range"
                min={1.2}
                max={4.5}
                step={0.05}
                value={crop.scale}
                onChange={(event) => updateCrop({ scale: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="versus-actions">
            <button className="btn" type="button" onClick={resetSelected}>
              Reset avatar
            </button>
            <button
              className="btn"
              type="button"
              onClick={() =>
                updateCrop({
                  focusX: DEFAULT_AVATAR_BUST_CROP.focusX,
                  focusY: DEFAULT_AVATAR_BUST_CROP.focusY,
                  scale: DEFAULT_AVATAR_BUST_CROP.scale,
                })
              }
            >
              Apply default
            </button>
            <button className="btn" type="button" onClick={resetAll}>
              Clear all drafts
            </button>
            <button className="btn btn-primary" type="button" onClick={() => void copyExport()}>
              Copy TS map
            </button>
          </div>
          {notice && (
            <p className="bust-crop-notice" role="status">
              {notice}
            </p>
          )}
        </section>
      </div>

      <section className="bust-crop-previews" aria-label="Location previews">
        <h2>Live location previews</h2>
        <div className="bust-crop-preview-grid">
          <article className="bust-crop-preview-card">
            <h3>Versus roster</h3>
            <p className="versus-muted">Bust on stage — multiplayer player row</p>
            <ol className="multiplayer-roster bust-crop-preview-roster">
              <li className="multiplayer-player is-self">
                <span className="multiplayer-player-rank">1</span>
                <span
                  className="multiplayer-player-portrait avatar-stage-well"
                  style={stageStyle}
                  aria-hidden="true"
                >
                  <PixelAvatar
                    characterId={avatarId}
                    size="sm"
                    decorative
                    className="multiplayer-player-avatar"
                  />
                </span>
                <span className="multiplayer-player-name">
                  You
                  <small>Host</small>
                </span>
                <span className="multiplayer-player-state">
                  <strong>Ready</strong>
                </span>
              </li>
            </ol>
          </article>

          <article className="bust-crop-preview-card">
            <h3>Homepage character</h3>
            <p className="versus-muted">Full-body on stage (home card; crop does not apply)</p>
            <div className="character-panel bust-crop-home-panel">
              <div className="character-panel-body">
                <p className="character-panel-username">{avatarMeta?.name ?? 'Player'}</p>
                <div
                  className="character-panel-avatar avatar-stage-well"
                  style={stageStyle}
                >
                  <PixelAvatar characterId={avatarId} size="lg" decorative />
                </div>
              </div>
            </div>
          </article>

          <article className="bust-crop-preview-card">
            <h3>Home stage bust</h3>
            <p className="versus-muted">Same home stage well, but with the bust crop</p>
            <div
              className="bust-crop-home-bust avatar-stage-well"
              style={stageStyle}
            >
              <PixelAvatar
                characterId={avatarId}
                size="sm"
                decorative
                className="multiplayer-player-avatar"
              />
            </div>
          </article>

          <article className="bust-crop-preview-card">
            <h3>Leaderboard row</h3>
            <p className="versus-muted">Compact bust chip (no stage)</p>
            <ul className="bust-crop-preview-list">
              <li className="leaderboard-row">
                <span className="leaderboard-rank">1</span>
                <span className="leaderboard-player">
                  <PixelAvatar
                    characterId={avatarId}
                    size="sm"
                    decorative
                    className="leaderboard-avatar"
                  />
                  <span className="leaderboard-name">{avatarMeta?.name ?? 'Player'}</span>
                </span>
                <span className="leaderboard-value">
                  <span className="leaderboard-value-num">12</span>
                  <span className="leaderboard-value-unit">Days</span>
                </span>
              </li>
            </ul>
          </article>

          <article className="bust-crop-preview-card">
            <h3>Header auth chip</h3>
            <p className="versus-muted">Account menu avatar</p>
            <div className="auth-avatar bust-crop-auth-chip" aria-hidden="true">
              <PixelAvatar characterId={avatarId} size="sm" decorative />
            </div>
          </article>
        </div>
      </section>

      <section className="bust-crop-export" aria-label="Export">
        <h2>Commit map</h2>
        <p className="versus-muted">
          Drafts are local only. Paste this into <code>src/lib/avatarBustCrop.ts</code> as{' '}
          <code>AVATAR_BUST_CROPS</code> when ready.
        </p>
        <textarea
          className="bust-crop-export-box"
          readOnly
          value={exportText}
          rows={10}
          spellCheck={false}
        />
      </section>
    </main>
  )
}
