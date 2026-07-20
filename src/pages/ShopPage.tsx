import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { useAuth } from '../components/AuthProvider'
import { Dialog } from '../components/Dialog'
import { PixelAvatar } from '../components/PixelAvatar'
import {
  AVATAR_AWAKENINGS_ENABLED,
  canPurchaseAwakening,
  isAwakenableAvatar,
  normalizeAwakeningLevel,
  type AwakeningLevel,
} from '../lib/avatarAwakening'
import { DEFAULT_AVATAR_ID } from '../lib/avatarComposition'
import {
  equipAvatar,
  equipStage,
  fetchAvatarShop,
  purchaseShopItem,
  type AvatarAwakeningShopItem,
  type AvatarShopItem,
  type AvatarShopSnapshot,
} from '../lib/avatarShop'
import { avatarStageCssUrl, avatarStageUrl, DEFAULT_STAGE_ID } from '../lib/avatarStages'
import { handleTabListKeyDown } from '../lib/focusTabs'
import { reportSecretEvent } from '../lib/secretEvents'

type ShopTab = 'characters' | 'backgrounds'
type PurchaseKind = 'avatar' | 'stage' | 'awakening'

export function ShopPage() {
  const { user, account, configured, refreshAccount } = useAuth()
  const [shop, setShop] = useState<AvatarShopSnapshot | null>(null)
  const [tab, setTab] = useState<ShopTab>('characters')
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(DEFAULT_AVATAR_ID)
  const [selectedStageId, setSelectedStageId] = useState<string>(DEFAULT_STAGE_ID)
  const [previewAwakeningOverride, setPreviewAwakeningOverride] = useState<AwakeningLevel | null>(
    null,
  )
  /** Click-pinned awakening preview (survives mouse leave / moving to Buy). */
  const [pinnedAwakeningPreview, setPinnedAwakeningPreview] = useState<AwakeningLevel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [purchaseTarget, setPurchaseTarget] = useState<AvatarShopItem | null>(null)
  const [purchaseAwakening, setPurchaseAwakening] = useState<AvatarAwakeningShopItem | null>(null)
  const [purchaseKind, setPurchaseKind] = useState<PurchaseKind>('avatar')
  const [notice, setNotice] = useState<string | null>(null)

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

  useEffect(() => {
    setPreviewAwakeningOverride(null)
    setPinnedAwakeningPreview(null)
  }, [selectedAvatarId])

  const balance = shop?.balance ?? account?.pointsBalance ?? 0
  const items = shop?.items ?? []
  const stages = shop?.stages ?? []
  const awakenings = shop?.awakenings ?? []
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

  const selectedAvatarAwakenings = useMemo(
    () =>
      awakenings
        .filter((row) => row.parentItemId === selectedAvatarId)
        .sort((a, b) => a.awakeningTier - b.awakeningTier),
    [awakenings, selectedAvatarId],
  )

  const ownedAwakeningLevel = normalizeAwakeningLevel(selectedAvatar?.awakeningLevel)
  const previewAwakeningLevel: AwakeningLevel =
    previewAwakeningOverride ??
    pinnedAwakeningPreview ??
    (tab === 'backgrounds'
      ? shop?.equippedAwakeningLevel ?? account?.equippedAwakeningLevel ?? 0
      : ownedAwakeningLevel)

  const previewAvatarId = tab === 'backgrounds' ? equippedAvatarId : selectedAvatarId
  const previewStageId = tab === 'backgrounds' ? selectedStageId : equippedStageId
  const selected = tab === 'backgrounds' ? selectedStage : selectedAvatar

  const previewStyle = {
    ['--avatar-stage-url' as string]: avatarStageCssUrl(previewStageId),
  } as CSSProperties

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
    setPurchaseAwakening(null)
    if (kind === 'stage') {
      const equipResult = await equipStage(item.id)
      setSelectedStageId(item.id)
      setNotice(equipResult.ok ? `${item.name} unlocked and equipped.` : `${item.name} unlocked.`)
    } else if (kind === 'awakening') {
      setNotice(`${item.name} unlocked.`)
      setPreviewAwakeningOverride(null)
    } else {
      const equipResult = await equipAvatar(item.id)
      setSelectedAvatarId(item.id)
      setNotice(equipResult.ok ? `${item.name} unlocked and equipped.` : `${item.name} unlocked.`)
    }
    await Promise.all([loadShop(), refreshAccount()])
    setBusy(false)
  }

  async function completeAwakeningPurchase(item: AvatarAwakeningShopItem) {
    setBusy(true)
    setError(null)
    const result = await purchaseShopItem(item.id)
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setPurchaseAwakening(null)
    setPurchaseTarget(null)
    setNotice(`${item.name} unlocked.`)
    setPinnedAwakeningPreview(item.awakeningTier)
    setPreviewAwakeningOverride(null)
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
    setPurchaseAwakening(null)
    setPurchaseTarget(selected)
  }

  function handleAwakeningBuy(row: AvatarAwakeningShopItem) {
    if (!user) {
      openSignIn()
      return
    }
    const gate = canPurchaseAwakening({
      parentOwned: Boolean(selectedAvatar?.owned),
      currentLevel: ownedAwakeningLevel,
    })
    if (!gate.ok) {
      setError(
        gate.error === 'parent_not_owned'
          ? 'Unlock this character before buying its awakening.'
          : 'You already own that awakening.',
      )
      return
    }
    setPurchaseKind('awakening')
    setPurchaseTarget(null)
    setPurchaseAwakening(row)
  }

  return (
    <main className="shop-page">
      <header className="shop-hero">
        <div>
          <p className="shop-kicker">Avatar shop</p>
          <h1>Avatar Shop</h1>
          <p>
            Collect characters and scenic backgrounds for your homepage portrait.
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
          <aside className="avatar-shop-stage" aria-label="Avatar preview">
            <div className="avatar-shop-preview avatar-stage-well" style={previewStyle}>
              <PixelAvatar
                characterId={previewAvatarId}
                size="xl"
                awakeningLevel={previewAwakeningLevel}
              />
            </div>

            {selected && (
              <div className="avatar-shop-meta">
                <span
                  className={`avatar-shop-rarity is-${selected.limitedTime ? 'limited-time' : selected.rarity}`}
                >
                  {selected.limitedTime ? 'Limited-time' : selected.rarity}
                </span>
                <h2>{selected.name}</h2>
                <p>{selected.description}</p>
              </div>
            )}

            <div className="avatar-shop-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !selected || selected.equipped}
                onClick={handleStageAction}
              >
                {!selected
                  ? 'Unavailable'
                  : selected.equipped
                    ? 'Equipped'
                    : selected.owned
                      ? !user
                        ? configured
                          ? 'Sign in to equip'
                          : 'Unavailable'
                        : busy
                          ? 'Equipping…'
                          : 'Equip'
                      : !user
                        ? configured
                          ? 'Sign in to unlock'
                          : 'Unavailable'
                        : selected.price === 0
                          ? busy
                            ? 'Claiming…'
                            : 'Claim free'
                          : `Buy ◆ ${selected.price}`}
              </button>
            </div>

            {AVATAR_AWAKENINGS_ENABLED &&
              tab === 'characters' &&
              selectedAvatar &&
              isAwakenableAvatar(selectedAvatar.id) && (
                <AwakeningsPanel
                  rows={selectedAvatarAwakenings}
                  parentOwned={selectedAvatar.owned}
                  currentLevel={ownedAwakeningLevel}
                  balance={balance}
                  signedIn={Boolean(user)}
                  busy={busy}
                  previewTier={previewAwakeningLevel}
                  pinnedTier={pinnedAwakeningPreview}
                  onHoverPreview={setPreviewAwakeningOverride}
                  onPinPreview={(tier) => {
                    setPinnedAwakeningPreview(tier)
                    setPreviewAwakeningOverride(null)
                  }}
                  onBuy={handleAwakeningBuy}
                />
              )}
          </aside>

          <section className="avatar-shop-catalog" aria-label="Shop catalog">
            <div
              className="avatar-shop-tabs"
              role="tablist"
              aria-label="Shop sections"
              onKeyDown={(event) => handleTabListKeyDown(event, event.currentTarget)}
            >
              <button
                type="button"
                role="tab"
                id="shop-tab-characters"
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
                aria-selected={tab === 'backgrounds'}
                tabIndex={tab === 'backgrounds' ? 0 : -1}
                className={`avatar-shop-tab${tab === 'backgrounds' ? ' is-active' : ''}`}
                onClick={() => setTab('backgrounds')}
              >
                Backgrounds
              </button>
            </div>

            {tab === 'characters' ? (
              <ul className="avatar-shop-grid" role="tabpanel" aria-labelledby="shop-tab-characters">
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
            ) : (
              <ul className="avatar-shop-grid" role="tabpanel" aria-labelledby="shop-tab-backgrounds">
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
            )}
          </section>
        </div>
      )}

      <PurchaseDialog
        item={purchaseTarget}
        awakening={purchaseAwakening}
        kind={purchaseKind}
        balance={balance}
        busy={busy}
        onClose={() => {
          if (!busy) {
            setPurchaseTarget(null)
            setPurchaseAwakening(null)
          }
        }}
        onConfirmAvatar={(item) => void completePurchase(item, purchaseKind)}
        onConfirmAwakening={(item) => void completeAwakeningPurchase(item)}
      />
    </main>
  )
}

function AwakeningsPanel({
  rows,
  parentOwned,
  currentLevel,
  balance,
  signedIn,
  busy,
  previewTier,
  pinnedTier,
  onHoverPreview,
  onPinPreview,
  onBuy,
}: {
  rows: AvatarAwakeningShopItem[]
  parentOwned: boolean
  currentLevel: AwakeningLevel
  balance: number
  signedIn: boolean
  busy: boolean
  previewTier: AwakeningLevel
  pinnedTier: AwakeningLevel | null
  onHoverPreview: (tier: AwakeningLevel | null) => void
  onPinPreview: (tier: AwakeningLevel | null) => void
  onBuy: (row: AvatarAwakeningShopItem) => void
}) {
  if (rows.length === 0) return null

  return (
    <section className="avatar-awakenings" aria-label="Awakening">
      <h3 className="avatar-awakenings-title">Awakening</h3>
      <p className="avatar-awakenings-copy">
        Click to preview the idle-into-action loop in the portrait above.
      </p>
      {previewTier > 0 && (
        <p className="avatar-awakenings-status" role="status">
          Previewing Awakening
          {pinnedTier === previewTier ? '' : ' (hover)'}
        </p>
      )}
      <ul className="avatar-awakenings-list">
        {rows.map((row) => {
          const owned = row.owned || currentLevel >= 1
          const gate = canPurchaseAwakening({
            parentOwned,
            currentLevel,
          })
          const canAfford = balance >= row.price
          const previewing = previewTier >= 1
          const pinned = pinnedTier != null && pinnedTier >= 1
          let actionLabel = 'Buy'
          if (owned) actionLabel = 'Owned'
          else if (!parentOwned) actionLabel = 'Locked'
          else if (!signedIn) actionLabel = 'Sign in'
          else if (!canAfford) actionLabel = 'Not enough'
          else actionLabel = `◆ ${row.price}`

          return (
            <li key={row.id}>
              <div
                className={`avatar-awakening-card is-${row.rarity}${owned ? ' is-owned' : ''}${
                  previewing ? ' is-preview' : ''
                }${pinned ? ' is-pinned' : ''}`}
              >
                <button
                  type="button"
                  className="avatar-awakening-preview-btn"
                  aria-pressed={pinned}
                  onMouseEnter={() => onHoverPreview(1)}
                  onFocus={() => onHoverPreview(1)}
                  onMouseLeave={() => onHoverPreview(null)}
                  onBlur={() => onHoverPreview(null)}
                  onClick={() => onPinPreview(pinned ? null : 1)}
                >
                  <span className="avatar-awakening-name">{row.name}</span>
                  <span className="avatar-awakening-desc">
                    {pinned ? 'Previewing — click again to stop' : row.description}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost avatar-awakening-buy"
                  disabled={busy || owned || !gate.ok || (signedIn && !canAfford)}
                  onClick={() => onBuy(row)}
                >
                  {actionLabel}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
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
  const level = normalizeAwakeningLevel(item.awakeningLevel)
  const actionLabel = item.owned
    ? item.equipped
      ? 'Equipped'
      : selected
        ? 'Selected'
        : 'Preview'
    : !signedIn || canAfford
      ? 'Preview'
      : 'Not enough'

  return (
    <button
      type="button"
      className={`avatar-card is-${item.limitedTime ? 'limited-time' : item.rarity}${selected ? ' is-selected' : ''}${!item.owned ? ' is-unowned' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="avatar-card-art">
        <PixelAvatar
          characterId={item.id}
          size="md"
          decorative
          awakeningLevel={item.owned ? level : 0}
        />
        <span className="avatar-rarity">
          {item.limitedTime ? 'Limited-time' : item.rarity}
        </span>
        {!item.owned && <span className="avatar-unowned-tag">Locked</span>}
        {AVATAR_AWAKENINGS_ENABLED && item.owned && level > 0 && (
          <span className="avatar-awakening-badge" aria-label="Awakened">
            Awakened
          </span>
        )}
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

  return (
    <button
      type="button"
      className={`avatar-card is-${item.limitedTime ? 'limited-time' : item.rarity}${selected ? ' is-selected' : ''}${!item.owned ? ' is-unowned' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div
        className="avatar-card-art avatar-stage-thumb"
        style={{ backgroundImage: `url('${avatarStageUrl(item.id)}')` }}
        role="img"
        aria-hidden="true"
      >
        <span className="avatar-rarity">{item.limitedTime ? 'Limited-time' : item.rarity}</span>
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
  awakening,
  kind,
  balance,
  busy,
  onClose,
  onConfirmAvatar,
  onConfirmAwakening,
}: {
  item: AvatarShopItem | null
  awakening: AvatarAwakeningShopItem | null
  kind: PurchaseKind
  balance: number
  busy: boolean
  onClose: () => void
  onConfirmAvatar: (item: AvatarShopItem) => void
  onConfirmAwakening: (item: AvatarAwakeningShopItem) => void
}) {
  const titleId = useId()
  const target = kind === 'awakening' ? awakening : item
  if (!target) return null

  const price = target.price
  const name = target.name

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
      {kind === 'avatar' && item ? (
        <PixelAvatar characterId={item.id} size="xl" decorative />
      ) : kind === 'awakening' && awakening ? (
        <PixelAvatar
          characterId={awakening.parentItemId}
          size="xl"
          decorative
          awakeningLevel={awakening.awakeningTier}
        />
      ) : item ? (
        <div
          className="shop-purchase-stage-thumb"
          style={{ backgroundImage: `url('${avatarStageUrl(item.id)}')` }}
          role="img"
          aria-label={item.name}
        />
      ) : null}
      <p className="modal-kicker">
        {kind !== 'awakening' && item?.price === 0 ? 'Confirm claim' : 'Confirm purchase'}
      </p>
      <h2 id={titleId} className="modal-title">
        {kind !== 'awakening' && item?.price === 0
          ? `Claim ${name}?`
          : `Unlock ${name}?`}
      </h2>
      <p id="shop-purchase-desc" className="shop-purchase-desc">
        {kind !== 'awakening' && item?.price === 0
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
          onClick={() => {
            if (kind === 'awakening' && awakening) onConfirmAwakening(awakening)
            else if (item) onConfirmAvatar(item)
          }}
        >
          {busy
            ? kind !== 'awakening' && item?.price === 0
              ? 'Claiming…'
              : 'Purchasing…'
            : kind !== 'awakening' && item?.price === 0
              ? 'Claim free'
              : `Spend ${price} points`}
        </button>
      </div>
    </Dialog>
  )
}
