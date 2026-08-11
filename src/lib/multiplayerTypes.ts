import type { ReaderTaste } from './readerTaste'
import type { StatsModeId } from './stats'

export const MULTIPLAYER_MIN_PLAYERS = 2
export const MULTIPLAYER_MAX_PLAYERS = 8
export const MULTIPLAYER_ROUNDS_PER_MODE = 3
/** Phase lengths mirror the intervals in the multiplayer backend migration. */
export const MULTIPLAYER_ROUND_MS = 180_000
export const MULTIPLAYER_COUNTDOWN_MS = 3_000
export const MULTIPLAYER_INTERMISSION_MS = 7_000
export const MULTIPLAYER_MODE_ORDER = [
  'summary',
  'character',
  'cover',
  'heardle',
] as const satisfies readonly StatsModeId[]
export const MULTIPLAYER_POOL_SOURCES = [
  'action',
  'romance',
  'both',
  'collaborative_lists',
] as const

export type MultiplayerMode = (typeof MULTIPLAYER_MODE_ORDER)[number]
export type MultiplayerPoolSource = (typeof MULTIPLAYER_POOL_SOURCES)[number]
export type MultiplayerRoomStatus =
  | 'lobby'
  | 'countdown'
  | 'active'
  | 'intermission'
  | 'completed'
  | 'cancelled'
  | 'expired'
export type MultiplayerRoundStatus =
  | 'pending'
  | 'countdown'
  | 'active'
  | 'completed'
  | 'cancelled'
export type MultiplayerAttemptStatus =
  | 'active'
  | 'won'
  | 'lost'
  | 'surrendered'
  | 'timed_out'

/** Sanitized room data returned to a room member. */
export interface MultiplayerRoomSnapshot {
  id: string
  code: string
  hostUserId: string
  status: MultiplayerRoomStatus
  selectedModes: MultiplayerMode[]
  roundsPerMode: 3
  minPlayers: 2
  maxPlayers: number
  memberCount: number
  currentRoundIndex: number | null
  taste: ReaderTaste | null
  poolSource: MultiplayerPoolSource
  createdAt: string | null
  startedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  phaseEndsAt: string | null
}

export interface MultiplayerListContributionSnapshot {
  userId: string
  username: string
  listName: string
  entryCount: number
  eligibleCounts: Partial<Record<MultiplayerMode, number>>
  combinedEligibleCount: number
  contributedAt: string | null
  /** Present only for the current viewer's own contribution. */
  sourceListId: string | null
}

export interface MultiplayerPoolSummary {
  contributorCount: number
  requiredContributorCount: number
  perModeEligibleCounts: Partial<Record<MultiplayerMode, number>>
  combinedEligibleCount: number
}

/** Member-visible profile and scoreboard data; no private account fields. */
export interface MultiplayerMemberSnapshot {
  userId: string
  username: string
  avatarId: string | null
  stageId: string | null
  isHost: boolean
  isReady: boolean
  isActive: boolean
  hasSurrendered: boolean
  score: number
  rank: number | null
  joinedAt: string | null
}

/** Viewer-safe round data. Clue metadata is supplied only when the server allows it. */
export interface MultiplayerRoundSnapshot {
  id: string
  index: number
  mode: MultiplayerMode
  modeRound: number
  status: MultiplayerRoundStatus
  clue: Record<string, unknown> | null
  answerId: number | null
  answerLabel: string | null
  maxGuesses: number
  startsAt: string | null
  endsAt: string | null
  completedAt: string | null
}

/**
 * Viewer-safe attempt progress. `guessIds` and `feedback` are expected only for
 * the current viewer's attempt; other members may receive counts/status only.
 */
export interface MultiplayerAttemptSnapshot {
  roundId: string
  userId: string
  status: MultiplayerAttemptStatus
  guessCount: number
  guessIds: number[] | null
  feedback: Record<string, unknown>[] | null
  score: number
  elapsedMs: number | null
  finalizedAt: string | null
  isViewer: boolean
}

export interface MultiplayerStateSnapshot {
  room: MultiplayerRoomSnapshot
  members: MultiplayerMemberSnapshot[]
  rounds: MultiplayerRoundSnapshot[]
  attempts: MultiplayerAttemptSnapshot[]
  listContributions: MultiplayerListContributionSnapshot[]
  poolSummary: MultiplayerPoolSummary
  serverNow: string | null
  version: number
}

export interface MultiplayerRpcFailure {
  ok: false
  error: string
  migrationMissing?: boolean
  state?: MultiplayerStateSnapshot
}

export interface MultiplayerStateSuccess {
  ok: true
  state: MultiplayerStateSnapshot
}

export type MultiplayerStateResult =
  | MultiplayerStateSuccess
  | MultiplayerRpcFailure

export type MultiplayerMutationResult =
  | (MultiplayerStateSuccess & {
      created?: boolean
      joined?: boolean
      accepted?: boolean
      correct?: boolean
      finalized?: boolean
      reason?: string
    })
  | MultiplayerRpcFailure

export interface MultiplayerIdempotentInput {
  /** Reuse this value when retrying the same user intent. */
  idempotencyKey?: string
}
