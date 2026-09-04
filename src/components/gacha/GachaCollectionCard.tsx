import { PixelAvatar } from '../PixelAvatar'
import {
  canSpendGachaCopies,
  gachaExchangeTargetRarity,
  nextGachaRarity,
  toGachaRarity,
} from '../../lib/gacha'
import type { AvatarCharacterMeta } from '../../lib/avatarComposition'

export function GachaCollectionCard({
  character,
  count = 0,
  busy = false,
  equipped = false,
  selected = false,
  onSelect,
  onExchange,
  onEquip,
}: {
  character: AvatarCharacterMeta
  count?: number
  busy?: boolean
  equipped?: boolean
  selected?: boolean
  onSelect?: () => void
  onExchange?: () => void
  onEquip?: () => void
}) {
  const rarity = toGachaRarity(character.rarity)
  const exchangeRarity = gachaExchangeTargetRarity(rarity)
  const sameRarityReroll = nextGachaRarity(rarity) === null
  const canExchange = Boolean(onExchange && canSpendGachaCopies(count))
  const copyLabel = count === 1 ? '1 copy' : `${count} copies`
  const exchangeReadyLabel = sameRarityReroll
    ? `Exchange 5 → ${exchangeRarity} reroll`
    : `Exchange 5 → ${exchangeRarity}`
  const exchangeProgressLabel = sameRarityReroll
    ? `${count}/5 to reroll`
    : `${count}/5 to ${exchangeRarity}`

  return (
    <article
      className={`avatar-card gacha-character-card is-${rarity}${selected ? ' is-selected' : ''}${equipped ? ' is-equipped' : ''}`}
    >
      <button
        type="button"
        className="gacha-card-select"
        aria-pressed={selected}
        aria-current={equipped ? 'true' : undefined}
        aria-label={`${character.name}, ${copyLabel}${equipped ? ', equipped' : ''}. Preview this character.`}
        onClick={onSelect}
      >
        <div className="avatar-card-art">
          <PixelAvatar characterId={character.id} size="md" decorative />
          <span className="avatar-rarity">{character.starter ? 'starter' : rarity}</span>
          {equipped ? <span className="avatar-equipped-badge">Equipped</span> : null}
        </div>
        <div className="avatar-card-copy">
          <span className="avatar-card-name">{character.name}</span>
          <span className="gacha-card-status">{copyLabel}</span>
        </div>
      </button>
      <div className="gacha-card-footer">
        <button
          type="button"
          className="gacha-exchange-button is-action"
          disabled={!onEquip || equipped || busy}
          aria-label={equipped ? `${character.name} is equipped` : `Equip ${character.name}`}
          onClick={onEquip}
        >
          {equipped ? 'Equipped' : 'Equip'}
        </button>
        <button
          type="button"
          className="gacha-exchange-button"
          disabled={!canExchange || busy}
          aria-label={
            canExchange
              ? sameRarityReroll
                ? `Exchange five ${character.name} copies for another ${exchangeRarity}`
                : `Exchange five ${character.name} copies for a ${exchangeRarity}`
              : sameRarityReroll
                ? `${count} of 5 ${character.name} copies toward a ${exchangeRarity} reroll`
                : `${count} of 5 ${character.name} copies toward ${exchangeRarity}`
          }
          onClick={onExchange}
        >
          {canExchange ? exchangeReadyLabel : exchangeProgressLabel}
        </button>
      </div>
    </article>
  )
}
