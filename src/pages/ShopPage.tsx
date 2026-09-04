import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'
import { Dialog } from '../components/Dialog'
import { PixelAvatar } from '../components/PixelAvatar'
import { DEFAULT_AVATAR_ID, describeAvatar } from '../lib/avatarComposition'
import {
  equipAvatar,
  equipStage,
  fetchAvatarShop,
  purchaseShopItem,
  type AvatarShopItem,
  type AvatarShopSnapshot,
} from '../lib/avatarShop'
import { avatarStageCssUrl, avatarStageUrl, DEFAULT_STAGE_ID } from '../lib/avatarStages'
import { handleTabListKeyDown } from '../lib/focusTabs'
import { isLocalGachaShop } from '../lib/gachaLocalStore'
import { parseLookTab, type LookTab } from '../lib/routes'
import { reportSecretEvent } from '../lib/secretEvents'
import { LocalBannerShop } from './LocalBannerShop'

type ShopTab = LookTab
type PurchaseKind = 'avatar' | 'stage'

export function ShopPage() {
  if (isLocalGachaShop()) return <LocalBannerShop />
  return <CatalogShopPage />
}

function CatalogShopPage() {
  const { user, account, configured, refreshAccount } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseLookTab(searchParams.get('tab'))
  const [shop, setShop] = useState<AvatarShopSnapshot | null>(null)
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(DEFAULT_AVATAR_ID)
  const [selectedStageId, setSelectedStageId] = useState<string>(DEFAULT_STAGE_ID)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [purchaseTarget, setPurchaseTarget] = useState<AvatarShopItem | null>(null)
  const [purchaseKind, setPurchaseKind] = useState<PurchaseKind>('avatar')
  const [notice, setNotice] = useState<string | null>(null)

  function setTab(next: ShopTab) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    setSearchParams(nextParams, { replace: true })
  }

  async function loadShop() {
    setLoading(true)
    const result = await fetchAvatarShop()
    if (result.ok) {
      setShop(result.shop)
      setSelectedAvatarId(result.shop.equippedAvatarId)
      setSelectedStageId(result.shop.equippedStageId)
      setError(null)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadShop()
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    void reportSecretEvent('shop_visit')
  }, [user])

  const balance = shop?.balance ?? account?.pointsBalance ?? 0
  const items = shop?.items ?? []
  const stages = shop?.stages ?? []
  const equippedAvatarId = shop?.equippedAvatarId ?? account?.equippedAvatarId ?? DEFAULT_AVATAR_ID
  const equippedStageId = shop?.equippedStageId ?? account?.equippedStageId ?? DEFAULT_STAGE_ID

  const selectedAvatar = useMemo(
    () => items.find((item) => item.id === selectedAvatarId) ?? items[0] ?? null,
    [items, selectedAvatarId],
  )
  const selectedStage = useMemo(
    () => stages.find((item) => item.id === selectedStageId) ?? stages[0] ?? null,
    [stages, selectedStageId],
  )

  const previewAvatarId = tab === 'backgrounds' ? equippedAvatarId : selectedAvatarId
  const previewStageId = tab === 'backgrounds' ? selectedStageId : equippedStageId
  const selected = tab === 'backgrounds' ? selectedStage : selectedAvatar

  const previewStyle = {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(previewStageId),
  } as CSSProperties
  const previewCharacterName =
    items.find((item) => item.id === previewAvatarId)?.name ?? describeAvatar(previewAvatarId)
  const previewStageName =
    stages.find((item) => item.id === previewStageId)?.name ?? 'Background'
  const previewPairLabel =
    tab === 'backgrounds'
      ? `Shown with ${previewCharacterName}`
      : `Shown on ${previewStageName}`
  const primaryActionLabel = (() => {
    if (!selected) return 'Unavailable'
    if (selected.equipped) {
      return tab === 'backgrounds' ? 'Background equipped' : 'Character equipped'
    }
    if (selected.owned) {
      if (!user) return configured ? 'Sign in to equip' : 'Unavailable'
      if (busy) return 'Equipping…'
      return tab === 'backgrounds' ? 'Equip background' : 'Equip character'
    }
    if (!user) return configured ? 'Sign in to unlock' : 'Unavailable'
    if (selected.price === 0) return busy ? 'Claiming…' : 'Claim free'
    return `Buy ◆ ${selected.price}`
  })()

  function openSignIn() {
    document.getElementById('site-auth-button')?.click()
  }

  async function handleEquipAvatar(item: AvatarShopItem) {
    if (!user) {
      openSignIn()
      return
    }
    setBusy(true)
    setError(null)
    const result = await equipAvatar(item.id)
    if (result.ok) {
      setSelectedAvatarId(item.id)
      setNotice(`${item.name} equipped.`)
      await Promise.all([loadShop(), refreshAccount()])
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  async function handleEquipStage(item: AvatarShopItem) {
    if (!user) {
      openSignIn()
      return
    }
    setBusy(true)
    setError(null)
    const result = await equipStage(item.id)
    if (result.ok) {
      setSelectedStageId(item.id)
      setNotice(`${item.name} equipped.`)
      await Promise.all([loadShop(), refreshAccount()])
    } else {
      setError(result.error)
    }
    setBusy(false)
  }

  async function completePurchase(item: AvatarShopItem, kind: PurchaseKind) {
    setBusy(true)
    setError(null)
    const result = await purchaseShopItem(item.id)
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setPurchaseTarget(null)
    if (kind === 'stage') {
      const equipResult = await equipStage(item.id)
      setSelectedStageId(item.id)
      setNotice(equipResult.ok ? `${item.name} unlocked and equipped.` : `${item.name} unlocked.`)
    } else {
      const equipResult = await equipAvatar(item.id)
      setSelectedAvatarId(item.id)
      setNotice(equipResult.ok ? `${item.name} unlocked and equipped.` : `${item.name} unlocked.`)
    }
    await Promise.all([loadShop(), refreshAccount()])
    setBusy(false)
  }

  function handleStageAction() {
    if (!selected) return
    if (!user) {
      openSignIn()
      return
    }
    if (selected.owned) {
      if (!selected.equipped) {
        if (tab === 'backgrounds') void handleEquipStage(selected)
        else void handleEquipAvatar(selected)
      }
      return
    }
    setPurchaseKind(tab === 'backgrounds' ? 'stage' : 'avatar')
    setPurchaseTarget(selected)
  }

  return (
    <main className="shop-page">
      <header className="shop-hero">
        <div>
          <p className="shop-kicker">Avatar shop</p>
          <h1>Avatar Shop</h1>
          <p>
            Earn points by playing the game, then spend them on characters and scenic backgrounds
            for your homepage portrait.
          </p>
        </div>
        <div className="shop-wallet" aria-label={`${balance} shop points`}>
          <span className="shop-wallet-gem" aria-hidden="true">
            ◆
          </span>
          <strong>{balance}</strong>
          <span>points</span>
        </div>
      </header>

      {!user && (
        <section className="shop-signin-panel">
          <PixelAvatar characterId={selectedAvatarId} size="lg" decorative />
          <div>
            <h2>Sign in to unlock and equip</h2>
            <p>
              Guests can preview characters and backgrounds below. Use the account button to
              sign in before purchasing or equipping. Guest rounds cannot earn server-verified
              points.
            </p>
          </div>
        </section>
      )}

      {notice && (
        <p className="shop-notice" role="status" aria-live="polite">
          {notice}
        </p>
      )}
      {error && (
        <p className="shop-error" role="alert">
          {error}
        </p>
      )}

      {loading && !shop ? (
        <div className="shop-loading" aria-busy="true">
          Loading avatar shop…
        </div>
      ) : (
        <div className="avatar-shop">
          <aside className="avatar-shop-stage" aria-label="Look preview">
            <div className="avatar-shop-look">
              <div
                className="avatar-shop-preview avatar-stage-well"
                style={previewStyle}
                role="img"
                aria-label={`Preview of ${previewCharacterName} on ${previewStageName}`}
              >
                <PixelAvatar characterId={previewAvatarId} size="xl" decorative />
              </div>

              {selected && (
                <div className="avatar-shop-meta">
                  <span
                    className={`avatar-shop-rarity is-${selected.limitedTime ? 'limited-time' : selected.rarity}`}
                  >
                    {selected.limitedTime ? 'Limited-time' : selected.rarity}
                  </span>
                  <h2>{selected.name}</h2>
                  <p className="visually-hidden" aria-live="polite">
                    {`Previewing ${selected.name}. ${previewPairLabel}.`}
                  </p>
                  <p className="avatar-shop-desc">{selected.description}</p>
                  <p className="avatar-shop-pair">{previewPairLabel}</p>
                </div>
              )}

              <div className="avatar-shop-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !selected || selected.equipped}
                  onClick={handleStageAction}
                >
                  {primaryActionLabel}
                </button>
              </div>
            </div>

          </aside>

          <section className="avatar-shop-catalog" aria-label="Shop catalog">
            <div
              className="avatar-shop-tabs"
              role="tablist"
              aria-label="Change character or background"
              onKeyDown={(event) => handleTabListKeyDown(event, event.currentTarget)}
            >
              <button
                type="button"
                role="tab"
                id="shop-tab-characters"
                aria-controls="shop-panel-characters"
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
                id="shop-tab-backgrounds"
                aria-controls="shop-panel-backgrounds"
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
              id="shop-panel-characters"
              aria-labelledby="shop-tab-characters"
              hidden={tab !== 'characters'}
            >
              <p className="avatar-shop-hint">
                Select a character to preview it on your current background, then equip or unlock it.
              </p>
              <ul className="avatar-shop-grid">
                {items.map((item) => (
                  <li key={item.id}>
                    <CharacterCard
                      item={item}
                      selected={item.id === selectedAvatarId}
                      balance={balance}
                      signedIn={Boolean(user)}
                      onSelect={() => setSelectedAvatarId(item.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div
              role="tabpanel"
              id="shop-panel-backgrounds"
              aria-labelledby="shop-tab-backgrounds"
              hidden={tab !== 'backgrounds'}
            >
              <p className="avatar-shop-hint">
                Select a background to preview it behind your character, then equip or unlock it.
              </p>
              <ul className="avatar-shop-grid">
                {stages.map((item) => (
                  <li key={item.id}>
                    <StageCard
                      item={item}
                      selected={item.id === selectedStageId}
                      balance={balance}
                      signedIn={Boolean(user)}
                      onSelect={() => setSelectedStageId(item.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      <PurchaseDialog
        item={purchaseTarget}
        kind={purchaseKind}
        balance={balance}
        busy={busy}
        onClose={() => {
          if (!busy) setPurchaseTarget(null)
        }}
        onConfirm={(item) => void completePurchase(item, purchaseKind)}
      />
    </main>
  )
}

function CharacterCard({
  item,
  selected,
  balance,
  signedIn,
  onSelect,
}: {
  item: AvatarShopItem
  selected: boolean
  balance: number
  signedIn: boolean
  onSelect: () => void
}) {
  const canAfford = balance >= item.price
  const actionLabel = item.owned
    ? item.equipped
      ? 'Equipped'
      : selected
        ? 'Selected'
        : 'Preview'
    : !signedIn || canAfford
      ? 'Preview'
      : 'Not enough'
  const stateLabel = item.equipped ? 'equipped' : item.owned ? 'owned' : 'locked'

  return (
    <button
      type="button"
      className={`avatar-card is-${item.limitedTime ? 'limited-time' : item.rarity}${selected ? ' is-selected' : ''}${item.equipped ? ' is-equipped' : ''}${!item.owned ? ' is-unowned' : ''}`}
      aria-pressed={selected}
      aria-current={item.equipped ? 'true' : undefined}
      aria-label={`${item.name}, ${stateLabel}. Preview this character.`}
      onClick={onSelect}
    >
      <div className="avatar-card-art">
        <PixelAvatar characterId={item.id} size="md" decorative />
        <span className="avatar-rarity">
          {item.limitedTime ? 'Limited-time' : item.rarity}
        </span>
        {item.equipped ? <span className="avatar-equipped-badge">Equipped</span> : null}
        {!item.owned && <span className="avatar-unowned-tag">Locked</span>}
      </div>
      <div className="avatar-card-copy">
        <span className="avatar-card-name">{item.name}</span>
        <span className="avatar-card-desc">{item.description}</span>
      </div>
      <div className="avatar-card-foot">
        <span className="avatar-price">
          {item.owned ? (
            'Owned'
          ) : item.price === 0 ? (
            'Free'
          ) : (
            <>
              <span aria-hidden="true">◆</span> {item.price}
            </>
          )}
        </span>
        <span className="avatar-card-action">{actionLabel}</span>
      </div>
    </button>
  )
}

function StageCard({
  item,
  selected,
  balance,
  signedIn,
  onSelect,
}: {
  item: AvatarShopItem
  selected: boolean
  balance: number
  signedIn: boolean
  onSelect: () => void
}) {
  const canAfford = balance >= item.price
  const actionLabel = item.owned
    ? item.equipped
      ? 'Equipped'
      : 'Preview'
    : !signedIn || canAfford
      ? 'Preview'
      : 'Not enough'
  const stateLabel = item.equipped ? 'equipped' : item.owned ? 'owned' : 'locked'

  return (
    <button
      type="button"
      className={`avatar-card is-${item.limitedTime ? 'limited-time' : item.rarity}${selected ? ' is-selected' : ''}${item.equipped ? ' is-equipped' : ''}${!item.owned ? ' is-unowned' : ''}`}
      aria-pressed={selected}
      aria-current={item.equipped ? 'true' : undefined}
      aria-label={`${item.name}, ${stateLabel}. Preview this background.`}
      onClick={onSelect}
    >
      <div
        className="avatar-card-art avatar-stage-thumb"
        style={{ backgroundImage: `url('${avatarStageUrl(item.id)}')` }}
        role="img"
        aria-hidden="true"
      >
        <span className="avatar-rarity">{item.limitedTime ? 'Limited-time' : item.rarity}</span>
        {item.equipped ? <span className="avatar-equipped-badge">Equipped</span> : null}
        {!item.owned && <span className="avatar-unowned-tag">Locked</span>}
      </div>
      <div className="avatar-card-copy">
        <span className="avatar-card-name">{item.name}</span>
        <span className="avatar-card-desc">{item.description}</span>
      </div>
      <div className="avatar-card-foot">
        <span className="avatar-price">
          {item.owned ? (
            'Owned'
          ) : item.price === 0 ? (
            'Free'
          ) : (
            <>
              <span aria-hidden="true">◆</span> {item.price}
            </>
          )}
        </span>
        <span className="avatar-card-action">{actionLabel}</span>
      </div>
    </button>
  )
}

function shopPurchaseConfirmCopy(item: AvatarShopItem): string {
  if (item.price === 0) {
    return `Claim ${item.name} for free?`
  }
  return `Spend ◆ ${item.price} to unlock ${item.name}?`
}

function PurchaseDialog({
  item,
  kind,
  balance,
  busy,
  onClose,
  onConfirm,
}: {
  item: AvatarShopItem | null
  kind: PurchaseKind
  balance: number
  busy: boolean
  onClose: () => void
  onConfirm: (item: AvatarShopItem) => void
}) {
  const titleId = useId()
  if (!item) return null

  const { name, price } = item
  const free = price === 0

  return (
    <Dialog
      open
      onClose={onClose}
      titleId={titleId}
      descriptionId="shop-purchase-desc"
      panelClassName="shop-purchase-modal"
    >
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
        <span aria-hidden="true">×</span>
      </button>
      {kind === 'avatar' ? (
        <PixelAvatar characterId={item.id} size="xl" decorative />
      ) : (
        <div
          className="shop-purchase-stage-thumb"
          style={{ backgroundImage: `url('${avatarStageUrl(item.id)}')` }}
          role="img"
          aria-label={item.name}
        />
      )}
      <p className="modal-kicker">{free ? 'Confirm claim' : 'Confirm purchase'}</p>
      <h2 id={titleId} className="modal-title">
        {free ? `Claim ${name}?` : `Unlock ${name}?`}
      </h2>
      <p id="shop-purchase-desc" className="shop-purchase-desc">
        {free
          ? shopPurchaseConfirmCopy(item)
          : `Spend ${price} points. You will have ${Math.max(0, balance - price)} left.`}
      </p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onConfirm(item)}
        >
          {busy ? (free ? 'Claiming…' : 'Purchasing…') : free ? 'Claim free' : `Spend ${price} points`}
        </button>
      </div>
    </Dialog>
  )
}
