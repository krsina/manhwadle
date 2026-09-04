import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GachaBanner } from '../components/gacha/GachaBanner'
import { GachaLab } from '../components/gacha/GachaLab'
import { useGachaLocal } from '../components/gacha/GachaLocalProvider'
import { GachaWeeklyModal } from '../components/gacha/GachaWeeklyModal'
import { GACHA_STUDIO_COPY } from '../components/gacha/gachaSkins'
import { PixelAvatar } from '../components/PixelAvatar'
import { useAuth } from '../components/AuthProvider'
import { getAvatarCharacterMeta } from '../lib/avatarComposition'
import { formatCountdown } from '../lib/daily'
import { toGachaRarity, type GachaRarity } from '../lib/gacha'
import { GACHA_PULL_COST, msUntilNextMondayUtc } from '../lib/gachaWeekly'
import { HOME_PATH, shopLookPath } from '../lib/routes'
import { warmGachaAudio } from '../lib/gachaSounds'

function openSignIn() {
  document.getElementById('site-auth-button')?.click()
}

export function LocalBannerShop() {
  const gacha = useGachaLocal()
  const { snapshot, lastResult, points, featured, pull, preview, buyWeekly } = gacha
  const { user, configured } = useAuth()
  const [busy, setBusy] = useState(false)
  const [playId, setPlayId] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const resetLabel = formatCountdown(msUntilNextMondayUtc(now))
  const featuredRows = useMemo(
    () =>
      featured.flatMap((row) => {
        const character = getAvatarCharacterMeta(row.id)
        return character ? [{ character, price: row.price }] : []
      }),
    [featured],
  )
  const previewRow = featuredRows.find((row) => row.character.id === previewId) ?? null
  const previewCharacter = previewRow?.character ?? null
  const previewPrice = previewRow?.price ?? 0
  const previewCopies = previewCharacter ? (snapshot.owned[previewCharacter.id] ?? 0) : 0
  const guest = !user
  const signInToPull = guest && configured
  const pullUnavailable = guest && !configured
  const pullDisabled = busy || pullUnavailable || (!guest && points < GACHA_PULL_COST)
  const pullLabel = pullUnavailable
    ? 'Unavailable'
    : signInToPull
      ? 'Sign in to pull'
      : undefined
  const weeklySignIn = guest && configured
  const weeklyUnavailable = guest && !configured

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const onOpeningComplete = useCallback(() => {
    setBusy(false)
  }, [])

  async function handlePull() {
    if (busy) return
    if (guest) {
      if (configured) openSignIn()
      return
    }
    void warmGachaAudio()
    const result = await pull()
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setNotice(null)
    setPlayId((value) => value + 1)
    setBusy(true)
  }

  function handlePreview(rarity?: GachaRarity | null) {
    if (busy) return
    void warmGachaAudio()
    const rolled = preview(rarity)
    setNotice(`Preview · ${rolled.rarity}`)
    setPlayId((value) => value + 1)
    setBusy(true)
  }

  async function handleWeeklyBuy(characterId: string) {
    if (busy) return
    if (guest) {
      if (configured) openSignIn()
      return
    }
    const row = featuredRows.find((entry) => entry.character.id === characterId)
    if (!row) return
    const result = await buyWeekly(characterId, now)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setPreviewId(null)
    setNotice(`Bought ${row.character.name} for ◆ ${row.price}. Pity was unchanged.`)
    setPlayId((value) => value + 1)
    setBusy(true)
    void warmGachaAudio()
  }

  return (
    <main className="shop-page gacha-shop-demo">
      <GachaWeeklyModal
        busy={busy}
        buyDisabled={busy || weeklyUnavailable || (!weeklySignIn && points < previewPrice)}
        buyLabel={
          weeklyUnavailable
            ? 'Unavailable'
            : weeklySignIn
              ? 'Sign in to buy'
              : undefined
        }
        character={previewCharacter}
        copies={previewCopies}
        onBuy={() => previewCharacter && void handleWeeklyBuy(previewCharacter.id)}
        onClose={() => {
          if (!busy) setPreviewId(null)
        }}
        points={points}
        price={previewPrice}
      />
      <header className="shop-hero gacha-shop-hero">
        <div>
          <p className="shop-kicker">{GACHA_STUDIO_COPY.kicker}</p>
          <h1>{GACHA_STUDIO_COPY.title}</h1>
          <p>{GACHA_STUDIO_COPY.description}</p>
          <nav className="gacha-shop-hero-nav" aria-label="Shop links">
            <Link
              className="btn btn-primary"
              to={shopLookPath({ collection: true, tab: 'characters' })}
            >
              Edit avatar & background
            </Link>
            <Link to={HOME_PATH}>Home</Link>
          </nav>
        </div>
        <div className="shop-wallet" aria-label={`${points} shop points`}>
          <span className="shop-wallet-gem" aria-hidden="true">
            ◆
          </span>
          <strong>{points}</strong>
          <span>points</span>
        </div>
      </header>

      <GachaBanner
        busy={busy}
        muted={snapshot.muted}
        notice={notice}
        onComplete={onOpeningComplete}
        onPull={() => void handlePull()}
        pity={snapshot.pity}
        playId={playId}
        pullDisabled={pullDisabled}
        pullLabel={pullLabel}
        result={lastResult}
        skip={snapshot.skip}
        points={points}
      />

      <GachaLab busy={busy} defaultOpen onPreview={handlePreview} />

      <section className="gacha-weekly" aria-label="Weekly featured skins">
        <header className="gacha-weekly-head">
          <div>
            <h2>This week</h2>
          </div>
          <p className="gacha-weekly-reset">Resets in {resetLabel}</p>
        </header>
        <ul className="gacha-weekly-grid">
          {featuredRows.map(({ character, price }) => {
            const rarity = toGachaRarity(character.rarity)
            const copies = snapshot.owned[character.id] ?? 0
            const selected = character.id === previewId
            return (
              <li key={character.id}>
                <article
                  className={`avatar-card gacha-character-card gacha-weekly-card is-${rarity}${selected ? ' is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="gacha-card-select"
                    aria-pressed={selected}
                    aria-haspopup="dialog"
                    aria-label={`${character.name}, ${rarity}, ◆ ${price}. Open details.`}
                    onClick={() => setPreviewId(character.id)}
                  >
                    <div className="avatar-card-art">
                      <PixelAvatar characterId={character.id} size="md" decorative />
                      <span className="avatar-rarity">{rarity}</span>
                    </div>
                    <div className="avatar-card-copy">
                      <span className="avatar-card-name">{character.name}</span>
                      <span className="gacha-card-status">
                        {copies > 0 ? `${copies} owned` : 'Not owned'}
                      </span>
                    </div>
                  </button>
                  <div className="gacha-card-footer">
                    <button
                      type="button"
                      className="gacha-exchange-button"
                      aria-haspopup="dialog"
                      onClick={() => setPreviewId(character.id)}
                    >
                      View · ◆ {price}
                    </button>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
