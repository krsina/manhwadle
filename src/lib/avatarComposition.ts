/** Whole-character avatar catalog: Style A shop characters, defaults, and parsers. */

export type AvatarRarity = 'starter' | 'common' | 'rare' | 'epic' | 'legendary'

/** Visual identity bullets used by animation / art prompts (internal). */
export interface AvatarTraits {
  hair: string
  eyes: string
  outfit: string
  props: string
  aura: string
}

export interface AvatarCharacterMeta {
  id: string
  name: string
  description: string
  /** Path under `/avatar-characters/style-a/` or full path relative to public. */
  assetPath: string
  assetKey: string
  /** Free starter / always owned for guests and new accounts. */
  starter: boolean
  /**
   * Free limited-time claim character — not auto-owned; must be claimed in the shop.
   * Shown with a Limited-time badge and sorted to the top (price 0).
   */
  limitedTime?: boolean
  price: number
  rarity: AvatarRarity
  /**
   * Internal manhwa/trope series label for Animation Creator defaults.
   * Never surface in public shop copy.
   */
  inspirationSeries: string
  /**
   * Internal character archetype within that series.
   * Never surface in public shop copy.
   */
  inspirationCharacter: string
  /** Locked visual identity for sequential frame prompts. */
  traits: AvatarTraits
}

export const STYLE_A_BASE = '/avatar-characters/style-a'
export const DEFAULT_AVATAR_ID = 'avatar_default_female'

export const AVATAR_CHARACTER_META: readonly AvatarCharacterMeta[] = [
  {
    id: 'avatar_quest_recruit',
    name: 'Quest Recruit',
    description: 'Limited-time free claim. Wooden practice sword and day-one adventurer energy.',
    assetPath: 'quest-recruit.png',
    assetKey: 'avatar_quest_recruit',
    starter: false,
    limitedTime: true,
    price: 0,
    rarity: 'common',
    inspirationSeries: 'Newbie adventurer',
    inspirationCharacter: 'Village quest recruit',
    traits: {
      hair: 'Messy warm-brown spikes with a cute cowlick',
      eyes: 'Bright amber-brown eyes with an eager slight smile',
      outfit: 'Cream laced tunic under an open sky-blue vest, brown shorts, hip pouch, tan boots',
      props: 'MUST hold ONE oversized wooden practice sword',
      aura: 'A few tiny soft warm-yellow sparkles (compact)',
    },
  },
  {
    id: 'avatar_spark_apprentice',
    name: 'Spark Apprentice',
    description: 'Limited-time free claim. Mint twin tails and a wooden beginner staff.',
    assetPath: 'spark-apprentice.png',
    assetKey: 'avatar_spark_apprentice',
    starter: false,
    limitedTime: true,
    price: 0,
    rarity: 'common',
    inspirationSeries: 'Newbie mage apprentice',
    inspirationCharacter: 'Village spark apprentice',
    traits: {
      hair: 'Soft pastel mint twin tails with bangs and a cream hair clip',
      eyes: 'Bright soft green eyes with a curious hopeful smile',
      outfit: 'Sky-blue beginner mage tunic with cream trim, belt, knee socks, brown shoes',
      props: 'MUST hold ONE wooden beginner staff with a pale-yellow orb tip',
      aura: 'A few tiny soft mint and pale-yellow sparkles (compact)',
    },
  },
  {
    id: 'avatar_default_female',
    name: 'Default (Female)',
    description: 'A plain starter look',
    assetPath: 'default-female.png',
    assetKey: 'avatar_default_female',
    starter: true,
    price: 0,
    rarity: 'common',
    inspirationSeries: 'Starter',
    inspirationCharacter: 'Default heroine',
    traits: {
      hair: 'Simple dark hair',
      eyes: 'Neutral dark eyes',
      outfit: 'Plain starter clothes',
      props: 'No signature prop',
      aura: 'None',
    },
  },
  {
    id: 'avatar_default_male',
    name: 'Default (Male)',
    description: 'A plain starter look',
    assetPath: 'default-male.png',
    assetKey: 'avatar_default_male',
    starter: true,
    price: 0,
    rarity: 'common',
    inspirationSeries: 'Starter',
    inspirationCharacter: 'Default hero',
    traits: {
      hair: 'Simple dark hair',
      eyes: 'Neutral dark eyes',
      outfit: 'Plain starter clothes',
      props: 'No signature prop',
      aura: 'None',
    },
  },
  {
    id: 'avatar_shadow_hunter',
    name: 'Shadow Hunter',
    description: 'Dual daggers, glowing cyan eyes, and a jagged shadow aura.',
    assetPath: 'shadow-hunter.png',
    assetKey: 'avatar_shadow_hunter',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Shadow assassin / hunter',
    inspirationCharacter: 'Dual-dagger shadow hunter',
    traits: {
      hair: 'Dark hair with sharp silhouette',
      eyes: 'Glowing cyan eyes',
      outfit: 'Dark hunter gear',
      props: 'MUST hold TWO daggers',
      aura: 'Jagged shadow aura (compact)',
    },
  },
  {
    id: 'avatar_skybreaker_monk',
    name: 'Skybreaker Monk',
    description: 'A tiger-wrapped brawler with a swirling forehead circlet.',
    assetPath: 'skybreaker-monk.png',
    assetKey: 'avatar_skybreaker_monk',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Martial monk / qi brawler',
    inspirationCharacter: 'Tiger-wrapped skybreaker monk',
    traits: {
      hair: 'Monk-cut dark hair',
      eyes: 'Fierce determined eyes',
      outfit: 'Tiger-wrapped martial wraps',
      props: 'Swirling forehead circlet',
      aura: 'Compact sky-qi wisps',
    },
  },
  {
    id: 'avatar_plum_blossom_blade',
    name: 'Plum Blossom Blade',
    description: 'White murim robes, pink plum petals, and a long gleaming sword.',
    assetPath: 'plum-blossom-blade.png',
    assetKey: 'avatar_plum_blossom_blade',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Mount Hua / murim',
    inspirationCharacter: 'Murim swordsman',
    traits: {
      hair: 'Long neat black hair tied partly back with white skull ornament',
      eyes: 'Calm dark eyes',
      outfit: 'White murim martial robes with thin pink trim; BLACK waist sash/belt with black tassel (not pink)',
      props: 'MUST hold ONE long straight sword clearly in hand',
      aura: 'A few floating pink plum blossom petals around the figure (compact)',
    },
  },
  {
    id: 'avatar_tower_ranker',
    name: 'Tower Ranker',
    description: 'Long blue coat, black hair, and a compact pocket-glow aura.',
    assetPath: 'tower-ranker.png',
    assetKey: 'avatar_tower_ranker',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Tower climber',
    inspirationCharacter: 'Ranker with pocket device',
    traits: {
      hair: 'Messy black hair with bangs',
      eyes: 'Sharp golden-yellow eyes',
      outfit: 'Long blue trench coat over dark clothes and boots',
      props: 'MUST show a glowing rectangular pocket device on the belt or in one hand',
      aura: 'Soft cool blue pocket-glow particles behind the figure',
    },
  },
  {
    id: 'avatar_fourth_wall_reader',
    name: 'Fourth-wall Reader',
    description: 'White coat, black hair, and a subtle crack-ink aura.',
    assetPath: 'fourth-wall-reader.png',
    assetKey: 'avatar_fourth_wall_reader',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Omniscient reader',
    inspirationCharacter: 'Reader with hardcover book',
    traits: {
      hair: 'Short neat black hair',
      eyes: 'Tired dark eyes with thin glasses',
      outfit: 'Long white coat over plain dark shirt and pants',
      props: 'MUST hold a closed hardcover book under one arm',
      aura: 'Subtle black ink crack lines behind the figure (no text, no UI)',
    },
  },
  {
    id: 'avatar_absolute_regressor',
    name: 'Absolute Regressor',
    description: 'Black coat, red time-fracture aura, and a single sword.',
    assetPath: 'absolute-regressor.png',
    assetKey: 'avatar_absolute_regressor',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Regression',
    inspirationCharacter: 'Cold regression swordsman',
    traits: {
      hair: 'Short spiky black hair',
      eyes: 'Cold red eyes',
      outfit: 'Black high-collar coat, dark armor accents, boots',
      props: 'MUST hold ONE sword clearly visible',
      aura: 'Jagged red time-fracture shards behind the silhouette',
    },
  },
  {
    id: 'avatar_ice_sovereign',
    name: 'Ice Sovereign',
    description: 'White-blue hair, crystalline dress, and an ice spear.',
    assetPath: 'ice-sovereign.png',
    assetKey: 'avatar_ice_sovereign',
    starter: false,
    price: 7000,
    rarity: 'epic',
    inspirationSeries: 'Ice empress',
    inspirationCharacter: 'Ice sovereign heroine',
    traits: {
      hair: 'Long flowing white-blue hair',
      eyes: 'Icy pale-blue eyes',
      outfit: 'Crystalline ice-blue gown with silver trim and boots',
      props: 'MUST hold ONE crystalline ice spear',
      aura: 'Compact ice crystal shards behind the figure',
    },
  },
  {
    id: 'avatar_flame_returnee',
    name: 'Flame Returnee',
    description: 'Ash-black hair, ember coat, and fire gauntlets.',
    assetPath: 'flame-returnee.png',
    assetKey: 'avatar_flame_returnee',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Flame returnee',
    inspirationCharacter: 'Fire gauntlet MC',
    traits: {
      hair: 'Ash-black messy hair with ember-orange tips',
      eyes: 'Glowing orange eyes',
      outfit: 'Charred dark coat with ember lining, dark pants, boots',
      props: 'MUST wear oversized fire gauntlets on BOTH hands',
      aura: 'Compact ember flame wisps behind the figure',
    },
  },
  {
    id: 'avatar_blood_contract',
    name: 'Blood Contract',
    description: 'Crimson eyes, dark cape, and floating blood orbs.',
    assetPath: 'blood-contract.png',
    assetKey: 'avatar_blood_contract',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Vampire / blood mage',
    inspirationCharacter: 'Blood-contract caster',
    traits: {
      hair: 'Sleek black hair with a crimson streak',
      eyes: 'Glowing crimson eyes',
      outfit: 'Dark formal coat with high collar and long black cape',
      props: 'MUST include THREE floating blood-red orbs near the hands',
      aura: 'Thin crimson mist behind the cape',
    },
  },
  {
    id: 'avatar_heavenly_demon',
    name: 'Heavenly Demon',
    description: 'Black-red martial robes, demonic qi aura, and a saber.',
    assetPath: 'heavenly-demon.png',
    assetKey: 'avatar_heavenly_demon',
    starter: false,
    price: 7000,
    rarity: 'epic',
    inspirationSeries: 'Demonic murim path',
    inspirationCharacter: 'Heavenly demon sabreur',
    traits: {
      hair: 'Long wild black hair',
      eyes: 'Fierce red eyes',
      outfit: 'Black and crimson murim robes with demonic pattern sash',
      props: 'MUST hold ONE curved saber clearly in hand',
      aura: 'Jagged black-red demonic qi behind the figure',
    },
  },
  {
    id: 'avatar_academy_prodigy',
    name: 'Academy Prodigy',
    description: 'Academy uniform, cloak, and a glowing tome.',
    assetPath: 'academy-prodigy.png',
    assetKey: 'avatar_academy_prodigy',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Magic academy',
    inspirationCharacter: 'Academy prodigy mage',
    traits: {
      hair: 'Long neat chestnut-brown hair with a side ribbon',
      eyes: 'Bright violet eyes',
      outfit: 'Magic academy uniform with navy cloak and gold trim',
      props: 'MUST hold ONE glowing open tome or short mage staff',
      aura: 'Soft violet magic sparkles behind the figure',
    },
  },
  {
    id: 'avatar_undead_marshal',
    name: 'Undead Marshal',
    description: 'Bone crown accents, dark armor, and a mini skull familiar.',
    assetPath: 'undead-marshal.png',
    assetKey: 'avatar_undead_marshal',
    starter: false,
    price: 7000,
    rarity: 'epic',
    inspirationSeries: 'Necromancer lord',
    inspirationCharacter: 'Undead marshal',
    traits: {
      hair: 'Pale white slicked-back hair',
      eyes: 'Hollow glowing green eyes',
      outfit: 'Dark necromancer armor with bone shoulder accents',
      props: 'MUST include a tiny floating skull familiar beside the shoulder',
      aura: 'Sickly green necromantic wisps behind the figure',
    },
  },
  {
    id: 'avatar_beast_pact_hunter',
    name: 'Beast Pact Hunter',
    description: 'Hunter cloak, beast-mark eyes, and an oversized bow.',
    assetPath: 'beast-pact-hunter.png',
    assetKey: 'avatar_beast_pact_hunter',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Contract hunter',
    inspirationCharacter: 'Beast-pact archer',
    traits: {
      hair: 'Short windblown dark-brown hair',
      eyes: 'Amber beast-mark eyes with vertical pupils',
      outfit: 'Leather hunter cloak, dark tunic, boots',
      props: 'MUST hold ONE oversized longbow clearly visible',
      aura: 'Compact claw-mark shaped green spirit wisps behind',
    },
  },
  {
    id: 'avatar_villainess_rose',
    name: 'Villainess Rose',
    description: 'Ornate gown, rose fan, and a readable smug smile.',
    assetPath: 'villainess-rose.png',
    assetKey: 'avatar_villainess_rose',
    starter: false,
    price: 4000,
    rarity: 'rare',
    inspirationSeries: 'Villainess duchess',
    inspirationCharacter: 'Rose-fan villainess',
    traits: {
      hair: 'Long elegant blonde curls with a rose hairpin',
      eyes: 'Sharp red eyes with a smug small smile',
      outfit: 'Ornate deep-red ballgown with gold trim',
      props: 'MUST hold ONE rose-decorated folding fan',
      aura: 'A few floating red rose petals (compact)',
    },
  },
] as const

const META_BY_ID = new Map(AVATAR_CHARACTER_META.map((character) => [character.id, character]))

export function getAvatarCharacterMeta(id: string | null | undefined): AvatarCharacterMeta | null {
  if (!id) return null
  return META_BY_ID.get(id) ?? null
}

/** Normalize unknown/legacy input to a known catalog id, defaulting safely. */
export function normalizeEquippedAvatarId(raw: unknown): string {
  return typeof raw === 'string' && META_BY_ID.has(raw) ? raw : DEFAULT_AVATAR_ID
}

export function describeAvatar(id: string | null | undefined): string {
  const meta = getAvatarCharacterMeta(id) ?? getAvatarCharacterMeta(DEFAULT_AVATAR_ID)!
  return meta.name
}

export function starterAvatarIds(): string[] {
  return AVATAR_CHARACTER_META.filter((character) => character.starter).map((character) => character.id)
}

/** Free limited-time claim avatars (price 0, not auto-owned). */
export function limitedTimeAvatarIds(): string[] {
  return AVATAR_CHARACTER_META.filter((character) => character.limitedTime).map(
    (character) => character.id,
  )
}

/** Shop catalog sort: lowest price first, limited-time before other free items, then id. */
export function compareShopItemsByPrice(
  a: { id: string; price: number; limitedTime?: boolean },
  b: { id: string; price: number; limitedTime?: boolean },
): number {
  if (a.price !== b.price) return a.price - b.price
  const aLimited = a.limitedTime === true ? 0 : 1
  const bLimited = b.limitedTime === true ? 0 : 1
  if (aLimited !== bLimited) return aLimited - bLimited
  return a.id.localeCompare(b.id)
}

/** Full public URL for a catalog character, defaulting safely for unknown ids. */
export function avatarAssetUrl(id: string | null | undefined): string {
  const meta = getAvatarCharacterMeta(id) ?? getAvatarCharacterMeta(DEFAULT_AVATAR_ID)!
  // Cache-bust when sprite plates are reprocessed (magenta fringe cleanup, etc.).
  return `${STYLE_A_BASE}/${meta.assetPath}?v=5`
}

/** Identity bullets for sequential animation prompts (internal). */
export function avatarIdentityPromptLines(id: string | null | undefined): string[] {
  const meta = getAvatarCharacterMeta(id) ?? getAvatarCharacterMeta(DEFAULT_AVATAR_ID)!
  return [
    `${meta.name} (inspired by ${meta.inspirationSeries} / ${meta.inspirationCharacter})`,
    meta.traits.hair,
    meta.traits.eyes,
    meta.traits.outfit,
    meta.traits.props,
    meta.traits.aura,
  ]
}
