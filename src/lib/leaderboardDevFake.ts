/**
 * DEV-only local overrides for Top Rankings + personal streak/milestones.
 * Never shipped to production builds (`import.meta.env.DEV` gated).
 */

import { isOwnerDevSessionActive } from './devAccess'
import {
  ACHIEVEMENT_DEFINITIONS,
  shouldAwardAchievement,
  type AchievementAward,
} from './achievements'
import {
  assignOrdinalRanksFromValues,
  isLeaderboardBoard,
  type LeaderboardBoard,
  type LeaderboardEntry,
  type LeaderboardPage,
} from './leaderboard'
import { DEFAULT_AVATAR_ID, AVATAR_CHARACTER_META } from './avatarComposition'
import { DEFAULT_STAGE_ID, AVATAR_STAGE_META } from './avatarStages'
import type { MyLeaderboardStanding } from './leaderboardApi'

export const DEV_LEADERBOARD_EVENT = 'manhwadle:dev-leaderboard'
const STORAGE_KEY = 'manhwadle:dev:leaderboard-v1'

export interface DevStandingDraft {
  username: string
  anyCurrentStreak: number
  anyMaxStreak: number
  allCurrentStreak: number
  allMaxStreak: number
  totalCompletions: number
  allCompleteDays: number
}

export interface DevLeaderboardState {
  enabled: boolean
  standing: DevStandingDraft
  boards: Record<LeaderboardBoard, LeaderboardEntry[]>
}

const DEFAULT_STANDING: DevStandingDraft = {
  username: 'DevPlayer',
  anyCurrentStreak: 3,
  anyMaxStreak: 7,
  allCurrentStreak: 1,
  allMaxStreak: 2,
  totalCompletions: 12,
  allCompleteDays: 2,
}

function emptyBoards(): Record<LeaderboardBoard, LeaderboardEntry[]> {
  return {
    current_streak: [],
    longest_streak: [],
    all_mode_streak: [],
  }
}

function defaultState(): DevLeaderboardState {
  return {
    enabled: false,
    standing: { ...DEFAULT_STANDING },
    boards: emptyBoards(),
  }
}

function clampNonNeg(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

function notify(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DEV_LEADERBOARD_EVENT))
}

function parseEntry(raw: unknown): LeaderboardEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.username !== 'string' || !row.username) return null
  if (typeof row.value !== 'number' || !Number.isFinite(row.value)) return null
  if (typeof row.publicId !== 'string' || !row.publicId) return null
  return {
    rank: typeof row.rank === 'number' ? row.rank : 0,
    username: row.username,
    value: clampNonNeg(row.value),
    publicId: row.publicId,
    equippedAvatarId:
      typeof row.equippedAvatarId === 'string' && row.equippedAvatarId
        ? row.equippedAvatarId
        : DEFAULT_AVATAR_ID,
    equippedStageId:
      typeof row.equippedStageId === 'string' && row.equippedStageId
        ? row.equippedStageId
        : DEFAULT_STAGE_ID,
    achievedAtMs:
      typeof row.achievedAtMs === 'number' && Number.isFinite(row.achievedAtMs)
        ? row.achievedAtMs
        : undefined,
  }
}

export function loadDevLeaderboardState(): DevLeaderboardState {
  if (!import.meta.env.DEV || typeof localStorage === 'undefined') {
    return defaultState()
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<DevLeaderboardState>
    const boards = emptyBoards()
    if (parsed.boards && typeof parsed.boards === 'object') {
      for (const board of Object.keys(boards) as LeaderboardBoard[]) {
        const list = (parsed.boards as Record<string, unknown>)[board]
        if (!Array.isArray(list)) continue
        boards[board] = list
          .map(parseEntry)
          .filter((e): e is LeaderboardEntry => e != null)
      }
    }
    const s = parsed.standing ?? DEFAULT_STANDING
    return {
      enabled: parsed.enabled === true,
      standing: {
        username:
          typeof s.username === 'string' && s.username.trim()
            ? s.username.trim()
            : DEFAULT_STANDING.username,
        anyCurrentStreak: clampNonNeg(Number(s.anyCurrentStreak)),
        anyMaxStreak: clampNonNeg(Number(s.anyMaxStreak)),
        allCurrentStreak: clampNonNeg(Number(s.allCurrentStreak)),
        allMaxStreak: clampNonNeg(Number(s.allMaxStreak)),
        totalCompletions: clampNonNeg(Number(s.totalCompletions)),
        allCompleteDays: clampNonNeg(Number(s.allCompleteDays)),
      },
      boards,
    }
  } catch {
    return defaultState()
  }
}

export function saveDevLeaderboardState(next: DevLeaderboardState): void {
  if (
    !import.meta.env.DEV ||
    !isOwnerDevSessionActive() ||
    typeof localStorage === 'undefined'
  ) {
    return
  }
  const normalized: DevLeaderboardState = {
    enabled: next.enabled,
    standing: {
      username: next.standing.username.trim() || DEFAULT_STANDING.username,
      anyCurrentStreak: clampNonNeg(next.standing.anyCurrentStreak),
      anyMaxStreak: Math.max(
        clampNonNeg(next.standing.anyMaxStreak),
        clampNonNeg(next.standing.anyCurrentStreak),
      ),
      allCurrentStreak: clampNonNeg(next.standing.allCurrentStreak),
      allMaxStreak: Math.max(
        clampNonNeg(next.standing.allMaxStreak),
        clampNonNeg(next.standing.allCurrentStreak),
      ),
      totalCompletions: clampNonNeg(next.standing.totalCompletions),
      allCompleteDays: clampNonNeg(next.standing.allCompleteDays),
    },
    boards: {
      current_streak: rerank(next.boards.current_streak),
      longest_streak: rerank(next.boards.longest_streak),
      all_mode_streak: rerank(next.boards.all_mode_streak),
    },
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* ignore quota */
  }
  notify()
}

function rerank(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return assignOrdinalRanksFromValues(entries).map(
    ({ rank, username, value, publicId, equippedAvatarId, equippedStageId, achievedAtMs }) => ({
      rank,
      username,
      value,
      publicId,
      equippedAvatarId: equippedAvatarId || DEFAULT_AVATAR_ID,
      equippedStageId: equippedStageId || DEFAULT_STAGE_ID,
      achievedAtMs,
    }),
  )
}

export function isDevLeaderboardOverrideEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    isOwnerDevSessionActive() &&
    loadDevLeaderboardState().enabled
  )
}

export function setDevLeaderboardEnabled(enabled: boolean): void {
  const state = loadDevLeaderboardState()
  saveDevLeaderboardState({ ...state, enabled })
}

export function updateDevStanding(patch: Partial<DevStandingDraft>): void {
  const state = loadDevLeaderboardState()
  saveDevLeaderboardState({
    ...state,
    standing: { ...state.standing, ...patch },
  })
}

/** Seed sample board rows + sync "you" from standing. */
export function seedSampleDevRankings(): void {
  const state = loadDevLeaderboardState()
  const youId = 'dev-you'
  const samples: Array<{
    username: string
    publicId: string
    avatarId: string
    stageId: string
    current: number
    longest: number
    allMode: number
    achievedAtMs: number
  }> = [
      { username: 'StreakQueen', publicId: 'dev-1', avatarId: 'avatar_shadow_hunter', stageId: 'stage_dusk_plaza', current: 14, longest: 21, allMode: 9, achievedAtMs: Date.UTC(2026, 0, 1) },
      { username: 'PanelHopper', publicId: 'dev-2', avatarId: 'avatar_villainess_rose', stageId: 'stage_blossom_courtyard', current: 9, longest: 12, allMode: 5, achievedAtMs: Date.UTC(2026, 0, 2) },
      { username: 'InkNight', publicId: 'dev-3', avatarId: 'avatar_heavenly_demon', stageId: 'stage_sky_meadow', current: 6, longest: 11, allMode: 4, achievedAtMs: Date.UTC(2026, 0, 3) },
      { username: 'DailyDose', publicId: 'dev-4', avatarId: 'avatar_tower_ranker', stageId: 'stage_dusk_plaza', current: 4, longest: 8, allMode: 2, achievedAtMs: Date.UTC(2026, 0, 4) },
      { username: 'Cliffhanger', publicId: 'dev-5', avatarId: 'avatar_plum_blossom_blade', stageId: 'stage_sky_meadow', current: 2, longest: 15, allMode: 7, achievedAtMs: Date.UTC(2026, 0, 5) },
      {
        username: state.standing.username,
        publicId: youId,
        avatarId: DEFAULT_AVATAR_ID,
        stageId: DEFAULT_STAGE_ID,
        current: state.standing.anyCurrentStreak,
        longest: state.standing.anyMaxStreak,
        allMode: state.standing.allMaxStreak,
        achievedAtMs: Date.UTC(2026, 0, 6),
      },
    ]

  saveDevLeaderboardState({
    ...state,
    enabled: true,
    boards: {
      current_streak: samples.map((s) => ({
        rank: 0,
        username: s.username,
        value: s.current,
        publicId: s.publicId,
        equippedAvatarId: s.avatarId,
        equippedStageId: s.stageId,
        achievedAtMs: s.achievedAtMs,
      })),
      longest_streak: samples.map((s) => ({
        rank: 0,
        username: s.username,
        value: s.longest,
        publicId: s.publicId,
        equippedAvatarId: s.avatarId,
        equippedStageId: s.stageId,
        achievedAtMs: s.achievedAtMs,
      })),
      all_mode_streak: samples.map((s) => ({
        rank: 0,
        username: s.username,
        value: s.allMode,
        publicId: s.publicId,
        equippedAvatarId: s.avatarId,
        equippedStageId: s.stageId,
        achievedAtMs: s.achievedAtMs,
      })),
    },
  })
}

const BULK_NAME_A = [
  'Ink',
  'Panel',
  'Streak',
  'Daily',
  'Cliff',
  'Webtoon',
  'Manhwa',
  'Scroll',
  'Frame',
  'Bloom',
  'Shadow',
  'Sky',
  'Flame',
  'Ice',
  'Tower',
  'Blade',
] as const

const BULK_NAME_B = [
  'Fox',
  'Queen',
  'Hopper',
  'Night',
  'Reader',
  'Knight',
  'Ace',
  'Spark',
  'Wolf',
  'Nova',
  'Drift',
  'Pulse',
  'Rune',
  'Vale',
  'Ash',
  'Lux',
] as const

function bulkAvatarIds(): string[] {
  return AVATAR_CHARACTER_META.map((m) => m.id)
}

function bulkStageIds(): string[] {
  return AVATAR_STAGE_META.map((m) => m.id)
}

function bulkUsername(index: number): string {
  const a = BULK_NAME_A[index % BULK_NAME_A.length]!
  const b = BULK_NAME_B[Math.floor(index / BULK_NAME_A.length) % BULK_NAME_B.length]!
  return `${a}${b}${index + 1}`
}

/**
 * DEV-only: fill all boards with `count` fake players (avatars + stages vary).
 * Includes the local "you" row from standing. Enables the override.
 */
export function seedBulkDevRankings(count = 500): void {
  const state = loadDevLeaderboardState()
  const n = Math.max(1, Math.min(2000, Math.floor(count)))
  const avatars = bulkAvatarIds()
  const stages = bulkStageIds()
  const youId = 'dev-you'

  const others = Array.from({ length: n - 1 }, (_, i) => {
    const current = 1 + ((i * 17) % 60)
    const longest = Math.max(current, current + ((i * 3) % 25))
    const allMode = 1 + ((i * 11) % 40)
    // Earlier index = achieved first (stable local tiebreak).
    const achievedAtMs = Date.UTC(2026, 0, 1) + i * 60_000
    return {
      username: bulkUsername(i),
      publicId: `dev-bulk-${i + 1}`,
      avatarId: avatars[i % avatars.length]!,
      stageId: stages[i % stages.length]!,
      current,
      longest,
      allMode,
      achievedAtMs,
    }
  })

  const samples = [
    ...others,
    {
      username: state.standing.username,
      publicId: youId,
      avatarId: DEFAULT_AVATAR_ID,
      stageId: DEFAULT_STAGE_ID,
      current: state.standing.anyCurrentStreak,
      longest: state.standing.anyMaxStreak,
      allMode: state.standing.allMaxStreak,
      achievedAtMs: Date.UTC(2026, 0, 1) + n * 60_000,
    },
  ]

  saveDevLeaderboardState({
    ...state,
    enabled: true,
    boards: {
      current_streak: samples.map((s) => ({
        rank: 0,
        username: s.username,
        value: s.current,
        publicId: s.publicId,
        equippedAvatarId: s.avatarId,
        equippedStageId: s.stageId,
        achievedAtMs: s.achievedAtMs,
      })),
      longest_streak: samples.map((s) => ({
        rank: 0,
        username: s.username,
        value: s.longest,
        publicId: s.publicId,
        equippedAvatarId: s.avatarId,
        equippedStageId: s.stageId,
        achievedAtMs: s.achievedAtMs,
      })),
      all_mode_streak: samples.map((s) => ({
        rank: 0,
        username: s.username,
        value: s.allMode,
        publicId: s.publicId,
        equippedAvatarId: s.avatarId,
        equippedStageId: s.stageId,
        achievedAtMs: s.achievedAtMs,
      })),
    },
  })
}

export function clearDevLeaderboard(): void {
  if (!import.meta.env.DEV || typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  notify()
}

/** Keep the "you" board rows aligned with standing after edits. */
export function syncDevYouOnBoards(): void {
  const state = loadDevLeaderboardState()
  const youId = 'dev-you'
  const upsert = (
    list: LeaderboardEntry[],
    value: number,
  ): LeaderboardEntry[] => {
    const rest = list.filter((e) => e.publicId !== youId)
    rest.push({
      rank: 0,
      username: state.standing.username,
      value,
      publicId: youId,
      equippedAvatarId: DEFAULT_AVATAR_ID,
      equippedStageId: DEFAULT_STAGE_ID,
    })
    return rest
  }
  saveDevLeaderboardState({
    ...state,
    boards: {
      current_streak: upsert(state.boards.current_streak, state.standing.anyCurrentStreak),
      longest_streak: upsert(state.boards.longest_streak, state.standing.anyMaxStreak),
      all_mode_streak: upsert(state.boards.all_mode_streak, state.standing.allMaxStreak),
    },
  })
}

export function getDevLeaderboardPage(
  board: LeaderboardBoard,
  limit: number,
  cursor: string | null | undefined,
): LeaderboardPage | null {
  if (!isDevLeaderboardOverrideEnabled()) return null
  if (!isLeaderboardBoard(board)) return null
  const state = loadDevLeaderboardState()
  const all = rerank(state.boards[board] ?? [])
  let start = 0
  if (cursor) {
    const idx = all.findIndex((e) => e.publicId === cursor)
    start = idx >= 0 ? idx + 1 : 0
  }
  const slice = all.slice(start, start + limit)
  const next = all[start + limit]
  return {
    board,
    entries: slice,
    nextCursor: next ? next.publicId : null,
    hasMore: Boolean(next),
  }
}

/** Exact username match on a local board (case-insensitive). */
export function getDevLeaderboardSearch(
  board: LeaderboardBoard,
  username: string,
): LeaderboardEntry | null | undefined {
  if (!isDevLeaderboardOverrideEnabled()) return undefined
  if (!isLeaderboardBoard(board)) return null
  const needle = username.trim().toLowerCase()
  if (!needle) return null
  const all = rerank(loadDevLeaderboardState().boards[board] ?? [])
  return all.find((e) => e.username.trim().toLowerCase() === needle) ?? null
}

export function getDevMyStanding(): MyLeaderboardStanding | null {
  if (!isDevLeaderboardOverrideEnabled()) return null
  const { standing, boards } = loadDevLeaderboardState()
  const rankFor = (board: LeaderboardBoard, value: number): number | null => {
    const hit = boards[board].find(
      (e) => e.publicId === 'dev-you' || e.username === standing.username,
    )
    if (hit) return hit.rank
  const ranked = assignOrdinalRanksFromValues(
      [...boards[board], { value, username: standing.username, publicId: 'dev-you', equippedAvatarId: DEFAULT_AVATAR_ID, equippedStageId: DEFAULT_STAGE_ID }],
    )
    return ranked.find((e) => e.publicId === 'dev-you')?.rank ?? null
  }
  return {
    eligible: true,
    username: standing.username,
    anyCurrentStreak: standing.anyCurrentStreak,
    anyMaxStreak: standing.anyMaxStreak,
    allCurrentStreak: standing.allCurrentStreak,
    allMaxStreak: standing.allMaxStreak,
    totalCompletions: standing.totalCompletions,
    boards: {
      current_streak: {
        value: standing.anyCurrentStreak,
        rank: rankFor('current_streak', standing.anyCurrentStreak),
      },
      longest_streak: {
        value: standing.anyMaxStreak,
        rank: rankFor('longest_streak', standing.anyMaxStreak),
      },
      all_mode_streak: {
        value: standing.allMaxStreak,
        rank: rankFor('all_mode_streak', standing.allMaxStreak),
      },
    },
  }
}

export function getDevAchievements(): AchievementAward[] | null {
  if (!isDevLeaderboardOverrideEnabled()) return null
  const { standing } = loadDevLeaderboardState()
  const metrics = {
    total_completions: standing.totalCompletions,
    any_max_streak: standing.anyMaxStreak,
    any_current_streak: standing.anyCurrentStreak,
    all_max_streak: standing.allMaxStreak,
    all_complete_days: standing.allCompleteDays,
  }
  const now = new Date().toISOString()
  return ACHIEVEMENT_DEFINITIONS.filter((def) =>
    shouldAwardAchievement(def, metrics),
  ).map((def) => ({
    id: def.id,
    version: def.version,
    title: def.title,
    description: def.description,
    category: def.category,
    awardedAt: now,
    pointReward: def.pointReward,
  }))
}
