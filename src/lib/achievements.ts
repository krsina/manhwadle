/**
 * Achievement catalog (client display + parsing).
 * Progressive ladders are server-metric awards. Secret/Hush-Hush titles are
 * claimed via report_secret_event (intentionally client-triggered).
 * hard_mode / hints are not competitive ladder criteria.
 */

export const ACHIEVEMENT_VERSION = 1

export type AchievementCategory =
  | 'completions'
  | 'streak'
  | 'all_mode'
  | 'visit'
  | 'secret'

export interface AchievementDefinition {
  id: string
  version: number
  title: string
  description: string
  category: AchievementCategory
  /** Metric key mirrored by the server awarder */
  metric:
    | 'total_completions'
    | 'any_max_streak'
    | 'any_current_streak'
    | 'all_max_streak'
    | 'all_complete_days'
    | 'total_visit_days'
    | 'visit_max_streak'
    | 'visit_comebacks'
    | 'visit_long_comebacks'
    | 'secret_flag'
  threshold: number
  /** Display-only mirror; the server is authoritative for grants. */
  pointReward: number
}

export const ACHIEVEMENT_POINT_REWARDS: Readonly<Record<string, number>> = {
  first_completion: 25,
  completions_5: 25,
  completions_10: 50,
  completions_25: 50,
  completions_50: 100,
  completions_100: 100,
  completions_250: 200,
  completions_500: 200,
  completions_750: 200,
  completions_1000: 200,
  completions_1500: 200,
  completions_2000: 200,
  completions_3000: 200,
  any_streak_2: 25,
  any_streak_3: 25,
  any_streak_7: 50,
  any_streak_14: 50,
  any_streak_30: 100,
  any_streak_60: 200,
  any_streak_100: 200,
  any_streak_180: 200,
  any_streak_365: 200,
  any_streak_500: 200,
  any_streak_730: 200,
  all_mode_day: 25,
  all_mode_days_5: 50,
  all_mode_streak_1: 25,
  all_mode_streak_2: 25,
  all_mode_streak_3: 50,
  all_mode_streak_7: 100,
  all_mode_days_25: 100,
  all_mode_streak_14: 100,
  all_mode_streak_30: 200,
  all_mode_days_50: 200,
  all_mode_streak_60: 200,
  all_mode_days_100: 200,
  all_mode_streak_100: 200,
  all_mode_days_180: 200,
  all_mode_streak_180: 200,
  all_mode_days_365: 200,
  all_mode_streak_365: 200,
  all_mode_days_730: 200,
  all_mode_streak_730: 200,
  // Hush-Hush hiatus returns (metric-backed).
  visit_comeback_1: 50,
  visit_comeback_3: 50,
  visit_comeback_5: 100,
  visit_comeback_10: 200,
  visit_timeskip: 100,
  // Hush-Hush: easy discovery / UI = 50; skill, timing, or patience = 100.
  secret_early_bird: 100,
  secret_authors_note: 50,
  secret_shopaholic: 50,
  secret_tourist: 50,
  secret_hard_mode: 50,
  secret_surrender: 50,
  secret_lurker: 50,
  secret_reauth: 50,
  secret_refresh: 50,
  secret_dark: 50,
  secret_lights: 50,
  secret_share: 50,
  secret_wrong_genre: 50,
  secret_escapist: 50,
  secret_account_menu: 50,
  secret_konami: 100,
  secret_background: 100,
  secret_hint_denied: 100,
  secret_perfect: 100,
  secret_last_second: 100,
  secret_night_owl: 100,
  secret_four_roads: 100,
  secret_identity: 100,
  secret_idle: 100,
  secret_speedrun: 100,
  secret_slow_burn: 100,
  secret_tab_twin: 100,
  secret_cascade: 100,
}

/**
 * Progressive ladders with Hush-Hush-style names + manhwa flavor.
 * Keep in sync with achievement_definitions seed.
 */
const ACHIEVEMENT_BASE_DEFINITIONS: readonly Omit<
  AchievementDefinition,
  'pointReward'
>[] = [
  // --- Completions ladder ---
  {
    id: 'first_completion',
    version: ACHIEVEMENT_VERSION,
    title: 'Awakening',
    description: 'Finish your first verified daily mode. The system has noticed you.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 1,
  },
  {
    id: 'completions_5',
    version: ACHIEVEMENT_VERSION,
    title: 'Tutorial',
    description: 'Finish 5 verified daily modes. The real dungeon is still ahead.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 5,
  },
  {
    id: 'completions_10',
    version: ACHIEVEMENT_VERSION,
    title: 'Cameo',
    description: 'Finish 10 verified daily modes. Still billed as supporting cast.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 10,
  },
  {
    id: 'completions_25',
    version: ACHIEVEMENT_VERSION,
    title: 'Canon Event',
    description: 'Finish 25 verified daily modes. No filler arcs allowed.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 25,
  },
  {
    id: 'completions_50',
    version: ACHIEVEMENT_VERSION,
    title: 'Nameplate',
    description: 'Finish 50 verified daily modes. You finally get a proper introduction.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 50,
  },
  {
    id: 'completions_100',
    version: ACHIEVEMENT_VERSION,
    title: 'Binge',
    description: 'Finish 100 verified daily modes. Sleep is a myth; next chapter is real.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 100,
  },
  {
    id: 'completions_250',
    version: ACHIEVEMENT_VERSION,
    title: 'Haunt',
    description: 'Finish 250 verified daily modes. The shelves remember your footsteps.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 250,
  },
  {
    id: 'completions_500',
    version: ACHIEVEMENT_VERSION,
    title: 'Subscribed',
    description: 'Finish 500 verified daily modes. Cancel culture cannot touch you.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 500,
  },
  {
    id: 'completions_750',
    version: ACHIEVEMENT_VERSION,
    title: 'Back Catalog',
    description: 'Finish 750 verified daily modes. Even the extras fear you.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 750,
  },
  {
    id: 'completions_1000',
    version: ACHIEVEMENT_VERSION,
    title: 'Hardcover',
    description: 'Finish 1000 verified daily modes. Bound and unskippable.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 1000,
  },
  {
    id: 'completions_1500',
    version: ACHIEVEMENT_VERSION,
    title: 'Side Volume',
    description: 'Finish 1500 verified daily modes. The extras became main text.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 1500,
  },
  {
    id: 'completions_2000',
    version: ACHIEVEMENT_VERSION,
    title: 'Reprint',
    description: 'Finish 2000 verified daily modes. Second printing, same addiction.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 2000,
  },
  {
    id: 'completions_3000',
    version: ACHIEVEMENT_VERSION,
    title: 'Lifetime Deal',
    description: 'Finish 3000 verified daily modes. Two years of receipts.',
    category: 'completions',
    metric: 'total_completions',
    threshold: 3000,
  },

  // --- Any-mode streak ladder (starts at 2; day-1 pairs with Awakening) ---
  {
    id: 'any_streak_2',
    version: ACHIEVEMENT_VERSION,
    title: 'You came back!',
    description: 'Reach a 2-day any-mode streak. The plot twist is you returned.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 2,
  },
  {
    id: 'any_streak_3',
    version: ACHIEVEMENT_VERSION,
    title: 'To Be Continued',
    description: 'Reach a 3-day any-mode streak. Just one more chapter…',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 3,
  },
  {
    id: 'any_streak_7',
    version: ACHIEVEMENT_VERSION,
    title: 'Friday Drop',
    description: 'Reach a 7-day any-mode streak. Reliable as a weekly upload.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 7,
  },
  {
    id: 'any_streak_14',
    version: ACHIEVEMENT_VERSION,
    title: 'Algorithm',
    description: 'Reach a 14-day any-mode streak. The feed has noticed you.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 14,
  },
  {
    id: 'any_streak_30',
    version: ACHIEVEMENT_VERSION,
    title: 'Mid-Boss',
    description: 'Reach a 30-day any-mode streak. Season-arc villain energy.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 30,
  },
  {
    id: 'any_streak_60',
    version: ACHIEVEMENT_VERSION,
    title: 'No Hiatus',
    description: 'Reach a 60-day any-mode streak. The author fears your consistency.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 60,
  },
  {
    id: 'any_streak_100',
    version: ACHIEVEMENT_VERSION,
    title: 'Cultivation',
    description: 'Reach a 100-day any-mode streak. Protagonist arc unlocked.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 100,
  },
  {
    id: 'any_streak_180',
    version: ACHIEVEMENT_VERSION,
    title: 'Half-Year Arc',
    description: 'Reach a 180-day any-mode streak. Mid-season cliffhanger survived.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 180,
  },
  {
    id: 'any_streak_365',
    version: ACHIEVEMENT_VERSION,
    title: 'Year One',
    description: 'Reach a 365-day any-mode streak. One solar cycle of chapters.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 365,
  },
  {
    id: 'any_streak_500',
    version: ACHIEVEMENT_VERSION,
    title: 'Endless Scroll',
    description: 'Reach a 500-day any-mode streak. The calendar gave up first.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 500,
  },
  {
    id: 'any_streak_730',
    version: ACHIEVEMENT_VERSION,
    title: 'Second Season',
    description: 'Reach a 730-day any-mode streak. The sequel nobody cancels.',
    category: 'streak',
    metric: 'any_max_streak',
    threshold: 730,
  },

  // --- Full-clear ladder ---
  {
    id: 'all_mode_day',
    version: ACHIEVEMENT_VERSION,
    title: 'Full Party',
    description: 'Finish every required mode on a single day. Party wipe averted.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 1,
  },
  {
    id: 'all_mode_streak_1',
    version: ACHIEVEMENT_VERSION,
    title: 'Clean Sweep',
    description: 'Reach a 1-day all-mode streak. Every mode. One day. Receipts filed.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 1,
  },
  {
    id: 'all_mode_streak_2',
    version: ACHIEVEMENT_VERSION,
    title: 'Double Feature',
    description: 'Reach a 2-day all-mode streak. Back-to-back sweeps. The roster believes you now.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 2,
  },
  {
    id: 'all_mode_days_5',
    version: ACHIEVEMENT_VERSION,
    title: 'Limited Drop',
    description: 'Bank 5 full-clear days. You collect clears like limited skins.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 5,
  },
  {
    id: 'all_mode_streak_3',
    version: ACHIEVEMENT_VERSION,
    title: 'Combo',
    description: 'Reach a 3-day all-mode streak. Consistency is the real skill issue.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 3,
  },
  {
    id: 'all_mode_streak_7',
    version: ACHIEVEMENT_VERSION,
    title: 'Perfect Week',
    description: 'Reach a 7-day all-mode streak. Four modes. Seven days. Zero excuses.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 7,
  },
  {
    id: 'all_mode_days_25',
    version: ACHIEVEMENT_VERSION,
    title: 'Omnivore',
    description: 'Bank 25 full-clear days. Every mode fears your return.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 25,
  },
  {
    id: 'all_mode_streak_14',
    version: ACHIEVEMENT_VERSION,
    title: 'Tower Floor',
    description: 'Reach a 14-day all-mode streak. Another floor cleared.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 14,
  },
  {
    id: 'all_mode_streak_30',
    version: ACHIEVEMENT_VERSION,
    title: 'Ranker',
    description: 'Reach a 30-day all-mode streak. Do not engage lightly.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 30,
  },
  {
    id: 'all_mode_days_50',
    version: ACHIEVEMENT_VERSION,
    title: 'Collector',
    description: 'Bank 50 full-clear days. Your clear shelf needs bracing.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 50,
  },
  {
    id: 'all_mode_streak_60',
    version: ACHIEVEMENT_VERSION,
    title: 'No Skip',
    description: 'Reach a 60-day all-mode streak. Filler arcs never stood a chance.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 60,
  },
  {
    id: 'all_mode_days_100',
    version: ACHIEVEMENT_VERSION,
    title: 'Vault',
    description: 'Bank 100 full-clear days. Locked, labeled, feared.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 100,
  },
  {
    id: 'all_mode_streak_100',
    version: ACHIEVEMENT_VERSION,
    title: 'Floor Master',
    description: 'Reach a 100-day all-mode streak. The tower rents you a suite.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 100,
  },
  {
    id: 'all_mode_days_180',
    version: ACHIEVEMENT_VERSION,
    title: 'Archive Key',
    description: 'Bank 180 full-clear days. Half a year of perfect parties.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 180,
  },
  {
    id: 'all_mode_streak_180',
    version: ACHIEVEMENT_VERSION,
    title: 'Half-Realm',
    description: 'Reach a 180-day all-mode streak. Season break denied.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 180,
  },
  {
    id: 'all_mode_days_365',
    version: ACHIEVEMENT_VERSION,
    title: 'Yearbook',
    description: 'Bank 365 full-clear days. Every page signed in clears.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 365,
  },
  {
    id: 'all_mode_streak_365',
    version: ACHIEVEMENT_VERSION,
    title: 'Solar Clear',
    description: 'Reach a 365-day all-mode streak. One orbit, zero wipeouts.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 365,
  },
  {
    id: 'all_mode_days_730',
    version: ACHIEVEMENT_VERSION,
    title: 'Dual Ledger',
    description: 'Bank 730 full-clear days. Two years. Two books. Same hunger.',
    category: 'all_mode',
    metric: 'all_complete_days',
    threshold: 730,
  },
  {
    id: 'all_mode_streak_730',
    version: ACHIEVEMENT_VERSION,
    title: 'Twin Suns',
    description: 'Reach a 730-day all-mode streak. Day and night both clear for you.',
    category: 'all_mode',
    metric: 'all_max_streak',
    threshold: 730,
  },

  // --- Secret / Hush-Hush ---
  {
    id: 'secret_early_bird',
    version: ACHIEVEMENT_VERSION,
    title: 'Early Bird',
    description: 'You showed up while the ink was still wet.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'visit_comeback_1',
    version: ACHIEVEMENT_VERSION,
    title: 'Regression',
    description: 'You woke up before the betrayal.',
    category: 'secret',
    metric: 'visit_comebacks',
    threshold: 1,
  },
  {
    id: 'visit_comeback_3',
    version: ACHIEVEMENT_VERSION,
    title: 'Second Life',
    description: 'Death is a soft reset.',
    category: 'secret',
    metric: 'visit_comebacks',
    threshold: 3,
  },
  {
    id: 'visit_comeback_5',
    version: ACHIEVEMENT_VERSION,
    title: 'Reincarnation',
    description: 'New body, same reading list.',
    category: 'secret',
    metric: 'visit_comebacks',
    threshold: 5,
  },
  {
    id: 'visit_comeback_10',
    version: ACHIEVEMENT_VERSION,
    title: 'Protagonist Arc',
    description: 'The plot cannot kill you.',
    category: 'secret',
    metric: 'visit_comebacks',
    threshold: 10,
  },
  {
    id: 'visit_timeskip',
    version: ACHIEVEMENT_VERSION,
    title: 'Time Skip',
    description: 'Welcome to the next season.',
    category: 'secret',
    metric: 'visit_long_comebacks',
    threshold: 1,
  },
  {
    id: 'secret_konami',
    version: ACHIEVEMENT_VERSION,
    title: 'Cheat Code',
    description: 'The ancient sequence still works.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_background',
    version: ACHIEVEMENT_VERSION,
    title: 'Background Cultivation',
    description: 'You left the cave door open.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_authors_note',
    version: ACHIEVEMENT_VERSION,
    title: "Author's Note",
    description: 'Please read before the next chapter.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_shopaholic',
    version: ACHIEVEMENT_VERSION,
    title: 'Shopaholic Awakening',
    description: 'Window shopping counts as training.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_tourist',
    version: ACHIEVEMENT_VERSION,
    title: 'Milestone Tourist',
    description: 'You came to stare at the trophies.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_hard_mode',
    version: ACHIEVEMENT_VERSION,
    title: 'Hard Mode Curious',
    description: 'You flipped the forbidden toggle.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_hint_denied',
    version: ACHIEVEMENT_VERSION,
    title: 'Hint Denied',
    description: 'Pride is a cultivation resource.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_surrender',
    version: ACHIEVEMENT_VERSION,
    title: 'Panic Surrender',
    description: 'The dungeon wins today.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_perfect',
    version: ACHIEVEMENT_VERSION,
    title: 'Perfect Panel',
    description: 'First try. No revisions.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_last_second',
    version: ACHIEVEMENT_VERSION,
    title: 'Last Second',
    description: 'The timer was a suggestion.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_night_owl',
    version: ACHIEVEMENT_VERSION,
    title: 'Night Owl',
    description: 'Sleep is filler.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_four_roads',
    version: ACHIEVEMENT_VERSION,
    title: 'Four Roads',
    description: 'You tried every gate in one sitting.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_lurker',
    version: ACHIEVEMENT_VERSION,
    title: 'Leaderboard Lurker',
    description: 'You checked the rankings without climbing.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_identity',
    version: ACHIEVEMENT_VERSION,
    title: 'Identity Crisis',
    description: 'New name, same protagonist.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_reauth',
    version: ACHIEVEMENT_VERSION,
    title: 'Return of the King',
    description: 'Signed out, signed in, still you.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_idle',
    version: ACHIEVEMENT_VERSION,
    title: 'Idle Immortal',
    description: 'AFK in the sect lobby.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_refresh',
    version: ACHIEVEMENT_VERSION,
    title: 'Refresh Ritual',
    description: 'You hit the formation again.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_dark',
    version: ACHIEVEMENT_VERSION,
    title: 'Dark Formation',
    description: 'The panel prefers the shadows.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_lights',
    version: ACHIEVEMENT_VERSION,
    title: 'Who turned on the lights?',
    description: 'You banished the shadows. The dungeon squints.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_share',
    version: ACHIEVEMENT_VERSION,
    title: 'Share the Spoilers',
    description: 'You posted the panel.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_wrong_genre',
    version: ACHIEVEMENT_VERSION,
    title: 'Wrong Genre',
    description: 'That title is from another timeline.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_speedrun',
    version: ACHIEVEMENT_VERSION,
    title: 'Speedrun Arc',
    description: 'Chapter cleared before the OP ended.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_slow_burn',
    version: ACHIEVEMENT_VERSION,
    title: 'Slow Burn',
    description: 'You took the scenic route.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_tab_twin',
    version: ACHIEVEMENT_VERSION,
    title: 'Tab Twin',
    description: 'Split consciousness technique.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_escapist',
    version: ACHIEVEMENT_VERSION,
    title: 'Escapist',
    description: 'You closed the modal like it owed you money.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_account_menu',
    version: ACHIEVEMENT_VERSION,
    title: 'Ten Curtain Calls',
    description: 'You pressed the account button ten times in one sitting.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
  {
    id: 'secret_cascade',
    version: ACHIEVEMENT_VERSION,
    title: 'Cascade',
    description: 'Multiple seals dropped in one breath.',
    category: 'secret',
    metric: 'secret_flag',
    threshold: 1,
  },
] as const

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] =
  ACHIEVEMENT_BASE_DEFINITIONS.map((definition) => ({
    ...definition,
    pointReward: ACHIEVEMENT_POINT_REWARDS[definition.id] ?? 0,
  }))

export interface AchievementAward {
  id: string
  version: number
  title: string
  description: string
  category: AchievementCategory
  awardedAt: string | null
  pointReward: number
}

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_DEFINITIONS.find((a) => a.id === id)
}

/**
 * Early non-secret ladder milestones for the homepage teaser when the viewer
 * has no unlocks yet (guest or fresh account). Hush-Hush stays hidden.
 */
export const HOME_TEASER_ACHIEVEMENT_IDS = [
  'first_completion',
  'completions_5',
  'any_streak_2',
  'all_mode_day',
  'completions_10',
  'any_streak_3',
  'all_mode_streak_1',
  'completions_25',
  'any_streak_7',
  'all_mode_days_5',
  'completions_50',
  'any_streak_14',
] as const

export function homeTeaserDefinitions(limit: number): AchievementDefinition[] {
  const capped = Math.max(0, Math.floor(limit))
  const defs: AchievementDefinition[] = []
  for (const id of HOME_TEASER_ACHIEVEMENT_IDS) {
    if (defs.length >= capped) break
    const def = getAchievementDefinition(id)
    if (!def || def.category === 'secret' || def.category === 'visit') continue
    defs.push(def)
  }
  return defs
}

export function definitionToAward(
  def: AchievementDefinition,
  awardedAt: string | null = null,
): AchievementAward {
  return {
    id: def.id,
    version: def.version,
    title: def.title,
    description: def.description,
    category: def.category,
    awardedAt,
    pointReward: def.pointReward,
  }
}

/** Pure check used in tests. Mirrors server threshold logic. */
export function shouldAwardAchievement(
  def: AchievementDefinition,
  metrics: Partial<Record<AchievementDefinition['metric'], number>>,
): boolean {
  const value = metrics[def.metric] ?? 0
  return value >= def.threshold
}

export function parseAchievementAwards(raw: unknown): AchievementAward[] {
  if (!raw || typeof raw !== 'object') return []
  const row = raw as Record<string, unknown>
  const list = Array.isArray(row.achievements)
    ? row.achievements
    : Array.isArray(raw)
      ? raw
      : null
  if (!list) return []
  const out: AchievementAward[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    if (typeof a.id !== 'string') continue
    const def = getAchievementDefinition(a.id)
    out.push({
      id: a.id,
      version: typeof a.version === 'number' ? a.version : (def?.version ?? 1),
      title: typeof a.title === 'string' ? a.title : (def?.title ?? a.id),
      description:
        typeof a.description === 'string'
          ? a.description
          : (def?.description ?? ''),
      category:
        a.category === 'completions' ||
        a.category === 'streak' ||
        a.category === 'all_mode' ||
        a.category === 'visit' ||
        a.category === 'secret'
          ? a.category
          : (def?.category ?? 'completions'),
      awardedAt: typeof a.awarded_at === 'string' ? a.awarded_at : null,
      // Prefer the client catalog so milestones match unlock toasts even when
      // the DB still has a stale/zeroed point_reward (e.g. pre-restore hush rows).
      pointReward:
        def?.pointReward ??
        (typeof a.point_reward === 'number'
          ? Math.max(0, Math.floor(a.point_reward))
          : 0),
    })
  }
  return out
}
