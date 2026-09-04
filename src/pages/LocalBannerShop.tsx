import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GachaBanner } from '../components/gacha/GachaBanner'
import { GachaLab } from '../components/gacha/GachaLab'
import { useGachaLocal } from '../components/gacha/GachaLocalProvider'
import { GachaWeeklyModal } from '../components/gacha/GachaWeeklyModal'
import { GACHA_STUDIO_COPY } from '../components/gacha/gachaSkins'
import { PixelAvatar } from '../components/PixelAvatar'
import { formatCountdown } from '../lib/daily'
import {
  msUntilNextMondayUtc,
  weeklyFeaturedCharacters,
  weeklyFeaturedPrice,
} from '../lib/gachaWeekly'
import { toGachaRarity, type GachaRarity } from '../lib/gacha'
import { HOME_PATH, shopLookPath } from '../lib/routes'
import { warmGachaAudio } from '../lib/gachaSounds'

export function LocalBannerShop() {
  const gacha = useGachaLocal()
  const { snapshot, lastResult, points, pull, preview, buyWeekly } = gacha
  const [busy, setBusy] = useState(false)
  const [playId, setPlayId] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [previewId, setPreviewId] = useState<string | null>(null)
  const featured = useMemo(() => weeklyFeaturedCharacters(now), [now])
  const resetLabel = formatCountdown(msUntilNextMondayUtc(now))
  const previewCharacter = featured.find((row) => row.id === previewId) ?? null
  const previewPrice = previewCharacter ? weeklyFeaturedPrice(previewCharacter) : 0
  const previewCopies = previewCharacter ? (snapshot.owned[previewCharacter.id] ?? 0) : 0

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const onOpeningComplete = useCallback(() => {
    setBusy(false)
  }, [])

  function handlePull() {
    if (busy) return
    void warmGachaAudio()
    const rolled = pull()
    if (!rolled) return
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

  function handleWeeklyBuy(characterId: string) {
    if (busy) return
    const character = featured.find((row) => row.id === characterId)
    if (!character) return
    const rolled = buyWeekly(characterId, now)
    if (!rolled) return
    setPreviewId(null)
    setNotice(
      `Bought ${character.name} for ◆ ${weeklyFeaturedPrice(character)}. Pity was unchanged.`,
    )
    setPlayId((value) => value + 1)
    setBusy(true)
    void warmGachaAudio()
  }

  return (
    <main className="shop-page gacha-shop-demo">
      <GachaWeeklyModal
        busy={busy}
        character={previewCharacter}
        copies={previewCopies}
        onBuy={() => previewCharacter && handleWeeklyBuy(previewCharacter.id)}
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
        onPull={handlePull}
        pity={snapshot.pity}
        playId={playId}
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
          {featured.map((character) => {
            const rarity = toGachaRarity(character.rarity)
            const price = weeklyFeaturedPrice(character)
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
