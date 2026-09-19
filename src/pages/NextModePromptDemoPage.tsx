import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BonusCelebrate } from '../components/BonusCelebrate'
import { ConfettiBurst } from '../components/ConfettiBurst'
import { ElectricBorder } from '../components/ElectricBorder'
import { MediaImage } from '../components/MediaImage'
import { ModeGlyph } from '../components/ModeGlyph'
import type { Manhwa, ManhwaCharacter } from '../lib/anilist-types'
import { characterImageUrl } from '../lib/anilist-types'
import {
  indexStoryBlurbs,
  type StoryDescriptionBlurbFile,
} from '../lib/blurbs'
import { characterDisplayName } from '../lib/characterNames'
import { loadClientCatalog } from '../lib/clientCatalog'
import { manhwaHasCover } from '../lib/cover'
import { guessableCharacters, manhwaHasGuessableCharacter } from '../lib/crops'
import {
  displayTitle,
  formatCountdown,
  getDailyAnswer,
  getTodayKey,
  msUntilNextUtcMidnight,
} from '../lib/daily'
import { pickMainCharacter } from '../lib/protagonist'
import {
  filterPoolByTaste,
  loadReaderTaste,
  withTastePrefix,
  type ReaderTaste,
} from '../lib/readerTaste'
import { filterPoolBySongs } from '../lib/songs'
import { listModes } from '../modes'
import { VERSUS_PATH, playPath } from '../lib/routes'
import storyBlurbData from '../data/storyDescriptionBlurb.json'

const storyBlurbIndex = indexStoryBlurbs(storyBlurbData as StoryDescriptionBlurbFile)

type LiveCard = {
  modeId: string
  modeName: string
  answer: Manhwa
  character: ManhwaCharacter | null
  completedIds: readonly string[]
}

function pickDaily(pool: Manhwa[], dateKey: string, seed: string): Manhwa | null {
  if (pool.length === 0) return null
  return getDailyAnswer(pool, dateKey, seed)
}

function ComboAddon({
  completedIds,
}: {
  completedIds: readonly string[]
}) {
  const modes = listModes()
  const completed = new Set(completedIds)
  const remaining = modes.filter((mode) => !completed.has(mode.id))
  const recommended = remaining[0] ?? null
  const doneToday = remaining.length === 0
  const progressLabel = `${completed.size} of ${modes.length} today`

  return (
    <div className="nmp-addon nmp-combo">
      <p className="nmp-kicker">{progressLabel}</p>
      <div className="nmp-chip-row">
        {modes.map((mode) => {
          const finished = completed.has(mode.id)
          const next = recommended?.id === mode.id
          const className = `nmp-chip${finished ? ' is-done' : ''}${next ? ' is-next' : ''}`
          const body = (
            <>
              <ModeGlyph presentationKey={mode.presentationKey} />
              {mode.name}
            </>
          )
          if (finished) {
            return (
              <span key={mode.id} className={className}>
                {body}
              </span>
            )
          }
          return (
            <Link
              key={mode.id}
              className={className}
              to={playPath(mode.id)}
              aria-current={next ? 'page' : undefined}
            >
              {body}
            </Link>
          )
        })}
      </div>
      {doneToday || !recommended ? (
        <div className="nmp-strip nmp-strip-done">
          <span className="nmp-strip-copy">
            <span>Daily set complete</span>
            <strong>Versus</strong>
          </span>
          <Link className="btn btn-primary" to={VERSUS_PATH}>
            Play Versus
          </Link>
        </div>
      ) : (
        <div className="nmp-strip">
          <span className="nmp-strip-icon">
            <ModeGlyph presentationKey={recommended.presentationKey} />
          </span>
          <span className="nmp-strip-copy">
            <span>Up next</span>
            <strong>{recommended.name}</strong>
          </span>
          <Link className="btn btn-primary" to={playPath(recommended.id)}>
            Play {recommended.name}
          </Link>
        </div>
      )}
    </div>
  )
}

function LiveShareFooter({ countdown }: { countdown: string }) {
  return (
    <div className="modal-share-footer">
      <div className="modal-share-countdown">
        <span className="modal-share-countdown-label">Next puzzle</span>
        <span className="modal-share-countdown-value">{countdown}</span>
      </div>
      <div className="modal-share-aside is-cluster">
        <div className="modal-share-result">
          <span className="modal-share-score is-win">1/6</span>
        </div>
        <button type="button" className="btn modal-share-btn">
          Share
        </button>
      </div>
    </div>
  )
}

function FirstTryResultBody({
  card,
  countdown,
  doubleSolve = false,
}: {
  card: LiveCard
  countdown: string
  doubleSolve?: boolean
}) {
  const titleText = displayTitle(card.answer)
  const showCharacter = Boolean(card.character)
  const characterName = card.character ? characterDisplayName(card.character) : null
  const heroImage = showCharacter
    ? characterImageUrl(card.character!) || card.answer.coverImage
    : card.answer.coverImage
  const genres = card.answer.genres.slice(0, showCharacter ? 2 : 3).join(' · ')

  return (
    <div
      className={`modal next-mode-demo-result is-first-try${
        doubleSolve ? ' is-double-solve' : ''
      }${showCharacter ? ' is-character-reveal' : ''}`}
    >
      <ElectricBorder variant={doubleSolve ? 'double-solve' : 'first-try'} />
      <button type="button" className="modal-close" aria-label="Close">
        <span aria-hidden="true">×</span>
      </button>
      <p className="modal-kicker">{doubleSolve ? 'Double solve!' : 'First try!'}</p>
      <h2 className="modal-title">{titleText}</h2>
      {characterName && <p className="modal-character-subtitle">{characterName}</p>}
      <p className="modal-score">
        <span className="modal-first-try-note">
          {doubleSolve ? 'Series and character on the opening guess' : 'Nailed it on the opening guess'}
        </span>
      </p>
      {heroImage && (
        <div className={`modal-hero${showCharacter ? ' is-character' : ''}`}>
          <MediaImage
            className={`modal-cover${showCharacter ? ' is-portrait' : ''}`}
            src={heroImage}
            alt={
              showCharacter && characterName
                ? `Portrait of ${characterName}`
                : `Cover of ${titleText}`
            }
            fallbackLabel="Artwork unavailable"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="modal-meta">
        <span>{card.answer.startDate.year ?? '—'}</span>
        <span>{card.answer.status}</span>
        <span>{genres || '—'}</span>
      </div>
      <LiveShareFooter countdown={countdown} />
      <ComboAddon completedIds={card.completedIds} />
    </div>
  )
}

function LiveResultCard({
  card,
  countdown,
}: {
  card: LiveCard
  countdown: string
}) {
  return (
    <article className="next-mode-demo-live-card">
      <p className="next-mode-demo-live-label">{card.modeName}</p>
      <FirstTryResultBody card={card} countdown={countdown} />
    </article>
  )
}

export function NextModePromptDemoPage() {
  const modes = listModes()
  const dateKey = getTodayKey()
  const taste: ReaderTaste = loadReaderTaste() ?? 'both'
  const [searchParams, setSearchParams] = useSearchParams()
  const phoneView = searchParams.get('view') === 'phone'
  const phoneMode = searchParams.get('mode') || 'summary'
  const doubleSolveView = searchParams.get('celebrate') === 'double'
  const [pool, setPool] = useState<Manhwa[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [countdownMs, setCountdownMs] = useState(() => msUntilNextUtcMidnight())

  useEffect(() => {
    let cancelled = false
    void loadClientCatalog()
      .then((data) => {
        if (!cancelled) setPool(data)
      })
      .catch(() => {
        if (!cancelled) setCatalogError('Could not load the title catalog.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdownMs(msUntilNextUtcMidnight())
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const cards = useMemo<LiveCard[]>(() => {
    if (!pool) return []
    const filtered = filterPoolByTaste(pool, taste)
    const byMode: Record<string, Manhwa | null> = {}
    for (const mode of modes) {
      const seed = withTastePrefix(mode.seedPrefix, taste)
      const playable =
        mode.id === 'summary'
          ? filtered.filter((manhwa) => storyBlurbIndex.has(manhwa.id))
          : mode.id === 'character'
            ? filtered.filter((manhwa) => manhwaHasGuessableCharacter(manhwa, { mainOnly: true }))
            : mode.id === 'cover'
              ? filtered.filter(manhwaHasCover)
              : mode.id === 'heardle'
                ? filterPoolBySongs(filtered, { includeBgm: false })
                : []
      byMode[mode.id] = pickDaily(playable, dateKey, seed)
    }

    return modes.flatMap((mode, index) => {
      const answer = byMode[mode.id]
      if (!answer) return []
      const character =
        mode.id === 'character'
          ? pickMainCharacter(answer) || guessableCharacters(answer, { mainOnly: true })[0] || null
          : null
      return [
        {
          modeId: mode.id,
          modeName: mode.name,
          answer,
          character,
          completedIds: modes.slice(0, index + 1).map((row) => row.id),
        },
      ]
    })
  }, [pool, taste, dateKey, modes])

  const countdown = formatCountdown(countdownMs)
  const phoneCard = cards.find((card) => card.modeId === phoneMode) ?? cards[0] ?? null

  return (
    <main className={`next-mode-demo${phoneView ? ' is-phone-view' : ''}`}>
      <header className="next-mode-demo-hero">
        <p className="eyebrow">Local design review</p>
        <h1>Play another mode</h1>
        <p>
          First-try result screens for today’s local dailies, with the A + D add-on after Share.
          Playing in order: Summary → Character → Cover → Heardle.
        </p>
        <p className="next-mode-demo-note">
          Taste lane: {taste}. Phone overlay:{' '}
          <Link to="/dev/next-mode?view=phone">open mobile first-try view</Link>
          {' · '}
          <Link to="/dev/next-mode?view=phone&celebrate=double">open mobile double-solve view</Link>.
        </p>
      </header>

      {catalogError ? (
        <section className="mode-empty" role="alert">
          <p className="mode-empty-title">Catalog unavailable</p>
          <p className="mode-empty-body">{catalogError}</p>
        </section>
      ) : !pool ? (
        <section className="mode-empty" aria-busy="true">
          <p className="mode-empty-title">Loading today’s titles…</p>
        </section>
      ) : phoneView && phoneCard ? (
        <div className="next-mode-demo-phone-stage">
          <div className="modal-backdrop next-mode-demo-phone-backdrop">
            {doubleSolveView ? <BonusCelebrate active /> : <ConfettiBurst active firstTry />}
            <div className="next-mode-demo-phone-modes" role="tablist" aria-label="Mode">
              {cards.map((card) => (
                <button
                  key={card.modeId}
                  type="button"
                  role="tab"
                  aria-selected={card.modeId === phoneCard.modeId}
                  className={`btn${card.modeId === phoneCard.modeId ? ' btn-primary' : ' btn-ghost'}`}
                  onClick={() =>
                    setSearchParams(
                      {
                        view: 'phone',
                        mode: card.modeId,
                        ...(doubleSolveView ? { celebrate: 'double' } : {}),
                      },
                      { replace: true },
                    )
                  }
                >
                  {card.modeName}
                </button>
              ))}
            </div>
            <div className="result-shell">
              <FirstTryResultBody
                card={phoneCard}
                countdown={countdown}
                doubleSolve={doubleSolveView}
              />
            </div>
          </div>
        </div>
      ) : (
        <section className="next-mode-demo-live">
          {cards.map((card) => (
            <LiveResultCard key={card.modeId} card={card} countdown={countdown} />
          ))}
        </section>
      )}
    </main>
  )
}
