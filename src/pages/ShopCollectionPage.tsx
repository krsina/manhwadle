import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GachaCollectionCard } from '../components/gacha/GachaCollectionCard'
import { GachaExchangeModal } from '../components/gacha/GachaExchangeModal'
import { GachaLab } from '../components/gacha/GachaLab'
import { useGachaLocal } from '../components/gacha/GachaLocalProvider'
import { PixelAvatar } from '../components/PixelAvatar'
import { useAuth } from '../components/AuthProvider'
import {
  AVATAR_CHARACTER_META,
  DEFAULT_AVATAR_ID,
  getAvatarCharacterMeta,
} from '../lib/avatarComposition'
import { type GachaRollResult } from '../lib/gacha'
import { handleTabListKeyDown } from '../lib/focusTabs'
import { HOME_PATH, parseLookTab, SHOP_PATH, type LookTab } from '../lib/routes'
import { warmGachaAudio } from '../lib/gachaSounds'
import {
  equipStage,
  fetchAvatarShop,
  purchaseShopItem,
  type AvatarShopItem,
  type AvatarShopSnapshot,
} from '../lib/avatarShop'
import {
  AVATAR_STAGE_META,
  avatarStageCssUrl,
  avatarStageUrl,
  DEFAULT_STAGE_ID,
} from '../lib/avatarStages'

export function ShopCollectionPage() {
  return <ShopCollectionView />
}

function ShopCollectionView() {
  const {
    snapshot,
    points,
    owned,
    lastResult,
    exchange,
    equip,
  } = useGachaLocal()
  const { user, configured, refreshAccount } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseLookTab(searchParams.get('tab'))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [shop, setShop] = useState<AvatarShopSnapshot | null>(null)
  const [shopError, setShopError] = useState<string | null>(null)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string>(DEFAULT_STAGE_ID)
  const [stageBusy, setStageBusy] = useState(false)
  const [exchangeResult, setExchangeResult] = useState<GachaRollResult | null>(null)
  const [exchangePlayId, setExchangePlayId] = useState(0)
  const [exchangeSourceName, setExchangeSourceName] = useState('')

  function setTab(next: LookTab) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    setSearchParams(nextParams, { replace: true })
  }

  const inventory = useMemo(
    () =>
      AVATAR_CHARACTER_META.filter((character) => owned.has(character.id))
        .map((character) => ({
          character,
          count: owned.get(character.id) ?? 0,
        }))
        .sort((a, b) => {
          const equippedRank =
            Number(b.character.id === snapshot.equippedAvatarId) -
            Number(a.character.id === snapshot.equippedAvatarId)
          return equippedRank || b.count - a.count || a.character.name.localeCompare(b.character.name)
        }),
    [owned, snapshot.equippedAvatarId],
  )

  const equippedCharacterId =
    snapshot.equippedAvatarId && owned.has(snapshot.equippedAvatarId)
      ? snapshot.equippedAvatarId
      : (inventory[0]?.character.id ?? DEFAULT_AVATAR_ID)

  useEffect(() => {
    if (selectedCharacterId && owned.has(selectedCharacterId)) return
    setSelectedCharacterId(equippedCharacterId)
  }, [equippedCharacterId, owned, selectedCharacterId])

  async function loadShop() {
    const result = await fetchAvatarShop()
    if (result.ok) {
      setShop(result.shop)
      setSelectedStageId((current) => {
        if (!shop) return result.shop.equippedStageId
        return result.shop.stages.some((row) => row.id === current)
          ? current
          : result.shop.equippedStageId
      })
      setShopError(null)
    } else {
      setShopError(result.error)
    }
  }

  useEffect(() => {
    void loadShop()
  }, [user?.id])

  const stages = useMemo(() => {
    const rows = shop?.stages ?? []
    return [...rows].sort((a, b) => {
      const equippedRank = Number(b.equipped) - Number(a.equipped)
      if (equippedRank) return equippedRank
      const ownedRank = Number(b.owned) - Number(a.owned)
      if (ownedRank) return ownedRank
      return a.name.localeCompare(b.name)
    })
  }, [shop?.stages])
  const previewCharacterId = selectedCharacterId ?? equippedCharacterId
  const previewCharacter = getAvatarCharacterMeta(previewCharacterId)
  const previewStage =
    stages.find((item) => item.id === selectedStageId) ??
    stages.find((item) => item.id === shop?.equippedStageId) ??
    stages[0] ??
    null
  const previewStageId = previewStage?.id ?? shop?.equippedStageId ?? DEFAULT_STAGE_ID
  const previewStyle = {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(previewStageId),
  } as CSSProperties
  const previewStageName =
    previewStage?.name ??
    AVATAR_STAGE_META.find((row) => row.id === previewStageId)?.name ??
    'Background'

  const onExchange = useCallback(
    async (characterId: string) => {
      const row = inventory.find((item) => item.character.id === characterId)
      if (!row || busy || exchangeResult) return
      const result = await exchange(row.character)
      if (!result.ok) {
        setNotice(result.error)
        return
      }
      void warmGachaAudio()
      setBusy(true)
      setExchangeSourceName(row.character.name)
      setExchangeResult(result.rolled)
      setExchangePlayId((value) => value + 1)
      setNotice(null)
    },
    [busy, exchange, exchangeResult, inventory],
  )

  const onExchangeClose = useCallback(() => {
    if (!exchangeResult) return
    setNotice(
      `Exchanged 5 ${exchangeSourceName} copies for ${exchangeResult.character.name}. Points and pity were unchanged.`,
    )
    setSelectedCharacterId(exchangeResult.character.id)
    setExchangeResult(null)
    setBusy(false)
  }, [exchangeResult, exchangeSourceName])

  async function handleEquipCharacter(characterId: string) {
    if (!(await equip(characterId))) return
    setSelectedCharacterId(characterId)
  }

  function openSignIn() {
    document.getElementById('site-auth-button')?.click()
  }

  async function handleStageAction(item: AvatarShopItem) {
    if (!user) {
      openSignIn()
      return
    }
    setStageBusy(true)
    setShopError(null)
    if (item.owned) {
      const result = await equipStage(item.id)
      if (result.ok) {
        setSelectedStageId(item.id)
        await Promise.all([loadShop(), refreshAccount()])
      } else {
        setShopError(result.error)
      }
      setStageBusy(false)
      return
    }
    const result = await purchaseShopItem(item.id)
    if (!result.ok) {
      setShopError(result.error)
      setStageBusy(false)
      return
    }
    const equipped = await equipStage(item.id)
    setSelectedStageId(item.id)
    setNotice(
      equipped.ok ? 'Background unlocked and equipped.' : 'Background unlocked.',
    )
    await Promise.all([loadShop(), refreshAccount()])
    setStageBusy(false)
  }

  const characterEquipped = previewCharacterId === equippedCharacterId
  const stageEquipped = Boolean(previewStage?.equipped)

  return (
    <main className="shop-page gacha-shop-demo">
      <GachaExchangeModal
        muted={snapshot.muted}
        onClose={onExchangeClose}
        playId={exchangePlayId}
        result={exchangeResult}
        skip={snapshot.skip}
        sourceName={exchangeSourceName}
      />
      <header className="shop-hero gacha-shop-hero">
        <div>
          <p className="shop-kicker">Your look</p>
          <h1>Character & background</h1>
          <p>Modify your character and background here!</p>
          <nav className="gacha-shop-hero-nav" aria-label="Look page links">
            <Link to={SHOP_PATH}>Banner shop</Link>
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

      {notice ? (
        <p className={`gacha-exchange-notice is-${lastResult?.rarity ?? 'common'}`} role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {shopError ? (
        <p className="shop-error" role="alert">
          {shopError}
        </p>
      ) : null}

      <div className="avatar-shop gacha-wardrobe">
        <aside className="avatar-shop-stage" aria-label="Look preview">
          <div className="avatar-shop-look">
            <div
              className="avatar-shop-preview avatar-stage-well"
              style={previewStyle}
              role="img"
              aria-label={`Preview of ${previewCharacter?.name ?? 'character'} on ${previewStageName}`}
            >
              <PixelAvatar characterId={previewCharacterId} size="xl" decorative />
            </div>
            <div className="avatar-shop-meta">
              <span className={`avatar-shop-rarity is-${previewCharacter?.rarity ?? 'common'}`}>
                {previewCharacter?.rarity ?? 'common'}
              </span>
              <h2>{previewCharacter?.name ?? 'Character'}</h2>
              <p className="visually-hidden" aria-live="polite">
                {`Previewing ${previewCharacter?.name ?? 'character'} on ${previewStageName}. Character ${characterEquipped ? 'equipped' : 'not equipped'}. Background ${stageEquipped ? 'equipped' : previewStage?.owned ? 'owned' : 'locked'}.`}
              </p>
            </div>
            <div className="avatar-shop-actions gacha-wardrobe-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || characterEquipped}
                onClick={() => void handleEquipCharacter(previewCharacterId)}
              >
                {characterEquipped ? 'Character equipped' : 'Equip character'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={stageBusy || !previewStage || previewStage.equipped}
                onClick={() => previewStage && void handleStageAction(previewStage)}
              >
                {!previewStage
                  ? 'No background'
                  : previewStage.equipped
                    ? 'Background equipped'
                    : !user
                      ? configured
                        ? 'Sign in for background'
                        : 'Background unavailable'
                      : previewStage.owned
                        ? 'Equip background'
                        : previewStage.price === 0
                          ? 'Claim background'
                          : `Buy background ◆ ${previewStage.price}`}
              </button>
            </div>
          </div>
        </aside>

        <section className="avatar-shop-catalog gacha-shop-catalog" aria-label="Looks">
          <div
            className="avatar-shop-tabs"
            role="tablist"
            aria-label="Change character or background"
            onKeyDown={(event) => handleTabListKeyDown(event, event.currentTarget)}
          >
            <button
              type="button"
              role="tab"
              id="looks-tab-characters"
              aria-controls="looks-panel-characters"
              aria-selected={tab === 'characters'}
              tabIndex={tab === 'characters' ? 0 : -1}
              className={`avatar-shop-tab${tab === 'characters' ? ' is-active' : ''}`}
              onClick={() => setTab('characters')}
            >
              Characters
            </button>
            <button
              type="button"
              role="tab"
              id="looks-tab-backgrounds"
              aria-controls="looks-panel-backgrounds"
              aria-selected={tab === 'backgrounds'}
              tabIndex={tab === 'backgrounds' ? 0 : -1}
              className={`avatar-shop-tab${tab === 'backgrounds' ? ' is-active' : ''}`}
              onClick={() => setTab('backgrounds')}
            >
              Backgrounds
            </button>
          </div>

          <div
            role="tabpanel"
            id="looks-panel-characters"
            aria-labelledby="looks-tab-characters"
            hidden={tab !== 'characters'}
          >
            <p className="avatar-shop-hint">
              Select a character to preview it on the current background, then equip.
            </p>
            {inventory.length === 0 ? (
              <p className="avatar-shop-empty">
                No characters yet.{' '}
                <Link to={SHOP_PATH}>Pull in the banner shop</Link> to add some.
              </p>
            ) : (
              <ul className="avatar-shop-grid">
                {inventory.map(({ character, count }) => (
                  <li key={character.id}>
                    <GachaCollectionCard
                      character={character}
                      count={count}
                      busy={busy}
                      selected={character.id === previewCharacterId}
                      equipped={character.id === equippedCharacterId}
                      onSelect={() => setSelectedCharacterId(character.id)}
                      onEquip={() => void handleEquipCharacter(character.id)}
                      onExchange={() => void onExchange(character.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            role="tabpanel"
            id="looks-panel-backgrounds"
            aria-labelledby="looks-tab-backgrounds"
            hidden={tab !== 'backgrounds'}
          >
            <p className="avatar-shop-hint">
              Select a background to preview it behind your character, then equip or buy it.
            </p>
            {!shop && !shopError ? (
              <p className="avatar-shop-empty">Loading backgrounds…</p>
            ) : (
              <ul className="avatar-shop-grid">
                {stages.map((item) => {
                  const selected = item.id === previewStageId
                  const stageState = item.equipped
                    ? 'equipped'
                    : item.owned
                      ? 'owned'
                      : 'locked'
                  return (
                    <li key={item.id}>
                      <article
                        className={`avatar-card gacha-character-card${selected ? ' is-selected' : ''}${item.equipped ? ' is-equipped' : ''}${!item.owned ? ' is-unowned' : ''}`}
                      >
                        <button
                          type="button"
                          className="gacha-card-select"
                          aria-pressed={selected}
                          aria-current={item.equipped ? 'true' : undefined}
                          aria-label={`${item.name}, ${stageState}. Preview this background.`}
                          onClick={() => setSelectedStageId(item.id)}
                        >
                          <div
                            className="avatar-card-art avatar-stage-thumb"
                            style={{ backgroundImage: `url('${avatarStageUrl(item.id)}')` }}
                            role="img"
                            aria-hidden="true"
                          >
                            <span className="avatar-rarity">
                              {item.limitedTime ? 'Limited-time' : item.rarity}
                            </span>
                            {item.equipped ? (
                              <span className="avatar-equipped-badge">Equipped</span>
                            ) : !item.owned ? (
                              <span className="avatar-unowned-tag">Locked</span>
                            ) : null}
                          </div>
                          <div className="avatar-card-copy">
                            <span className="avatar-card-name">{item.name}</span>
                            <span className="gacha-card-status">
                              {item.owned
                                ? 'Owned'
                                : item.price === 0
                                  ? 'Free claim'
                                  : `◆ ${item.price}`}
                            </span>
                          </div>
                        </button>
                        <div className="gacha-card-footer">
                          <button
                            type="button"
                            className="gacha-exchange-button is-action"
                            disabled={stageBusy || item.equipped}
                            aria-label={
                              item.equipped
                                ? `${item.name} is equipped`
                                : item.owned
                                  ? `Equip ${item.name} background`
                                  : item.price === 0
                                    ? `Claim ${item.name} background`
                                    : `Buy ${item.name} background for ${item.price} points`
                            }
                            onClick={() => void handleStageAction(item)}
                          >
                            {item.equipped
                              ? 'Equipped'
                              : item.owned
                                ? 'Equip'
                                : item.price === 0
                                  ? 'Claim free'
                                  : `Buy ◆ ${item.price}`}
                          </button>
                        </div>
                      </article>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <GachaLab busy={busy} showGrant />
    </main>
  )
}
