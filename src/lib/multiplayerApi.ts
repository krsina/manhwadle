import { isSupabaseConfigured, supabase } from './supabase'
import {
  MULTIPLAYER_MAX_PLAYERS,
  MULTIPLAYER_MIN_PLAYERS,
  MULTIPLAYER_MODE_ORDER,
  MULTIPLAYER_POOL_SOURCES,
  MULTIPLAYER_ROUNDS_PER_MODE,
  type MultiplayerActiveRoomResult,
  type MultiplayerActiveRoomSummary,
  type MultiplayerAttemptSnapshot,
  type MultiplayerAttemptStatus,
  type MultiplayerIdempotentInput,
  type MultiplayerMemberSnapshot,
  type MultiplayerListContributionSnapshot,
  type MultiplayerMode,
  type MultiplayerMutationResult,
  type MultiplayerRoomSnapshot,
  type MultiplayerRoomStatus,
  type MultiplayerPoolSource,
  type MultiplayerPoolSummary,
  type MultiplayerRoundSnapshot,
  type MultiplayerRoundStatus,
  type MultiplayerStateResult,
  type MultiplayerStateSnapshot,
} from './multiplayerTypes'

const ROOM_STATUSES: readonly MultiplayerRoomStatus[] = [
  'lobby',
  'countdown',
  'active',
  'intermission',
  'completed',
  'cancelled',
  'expired',
]
const ROUND_STATUSES: readonly MultiplayerRoundStatus[] = [
  'pending',
  'countdown',
  'active',
  'completed',
  'cancelled',
]
const ATTEMPT_STATUSES: readonly MultiplayerAttemptStatus[] = [
  'active',
  'won',
  'lost',
  'surrendered',
  'timed_out',
]

export const MULTIPLAYER_INVITE_CODE_PATTERN =
  /^(?:[A-Z2-9]{6}|[A-Z2-9]{8})$/

export function normalizeMultiplayerInviteCode(value: string): string {
  const trimmed = value.trim().toUpperCase()
  if (MULTIPLAYER_INVITE_CODE_PATTERN.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const candidate = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
    return MULTIPLAYER_INVITE_CODE_PATTERN.test(candidate) ? candidate : trimmed
  } catch {
    return trimmed
  }
}

export function isValidMultiplayerInviteCode(value: string): boolean {
  return MULTIPLAYER_INVITE_CODE_PATTERN.test(
    normalizeMultiplayerInviteCode(value),
  )
}

/** Absolute invite URL friends can open or paste into Join. */
export function buildMultiplayerInviteUrl(
  code: string,
  origin: string = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  const normalized = normalizeMultiplayerInviteCode(code)
  const base = origin.replace(/\/$/, '')
  return `${base}/versus/${encodeURIComponent(normalized)}`
}

export function multiplayerErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    auth_required: 'Sign in to play Versus.',
    username_required: 'Choose a username before joining Versus.',
    reader_taste_required: 'Choose your reader taste in Preferences first.',
    room_not_found: 'That room is unavailable or its results have expired.',
    room_unavailable: 'That room is unavailable.',
    room_not_joinable: 'That invite is invalid or the room is no longer open.',
    room_full: 'That room is full.',
    active_room_exists:
      'You still have an open Versus room. Resume it or leave before starting another.',
    member_inactive: 'You have left this match.',
    not_room_member: 'You are no longer a member of this room.',
    players_not_ready: 'Every player must be ready.',
    invalid_member_count: 'At least two players are required.',
    need_more_players: 'At least two players are required.',
    puzzle_unavailable: 'One of the selected modes does not have enough private puzzles.',
    invalid_pool_source: 'Choose a valid title pool.',
    collaborative_pool_required: 'This room is not using collaborative lists.',
    list_not_found: 'That private list is unavailable.',
    list_contribution_required: 'Contribute one of your saved lists before readying up.',
    list_contributors_missing: 'At least one player has to share a saved list.',
    collaborative_schedule_unavailable:
      'These overlapping lists cannot make a complete no-repeat match. Add more varied titles.',
    create_quota_exceeded: 'You have reached the emergency daily room limit. Try again tomorrow.',
    abuse_cooldown: 'Room creation is temporarily paused after repeated early match exits.',
    rate_limited: 'Too many requests. Wait a moment and try again.',
    migration_missing: 'Versus is not available on this server yet.',
  }
  if (error.startsWith('selected_mode_pool_unavailable:')) {
    return 'One of the selected modes does not have enough private puzzles.'
  }
  if (error.startsWith('collaborative_mode_pool_insufficient:')) {
    return 'A selected mode needs at least three eligible unique titles.'
  }
  return messages[error] ?? error.replaceAll('_', ' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nonNegInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = nonNegInt(value)
  return parsed > 0 ? parsed : fallback
}

function nullableNonNegInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && allowed.includes(value as T)
}

export function parseMultiplayerModes(value: unknown): MultiplayerMode[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const modes = value.filter((mode): mode is MultiplayerMode =>
    isOneOf(mode, MULTIPLAYER_MODE_ORDER),
  )
  if (modes.length !== value.length || new Set(modes).size !== modes.length) {
    return null
  }
  return [...MULTIPLAYER_MODE_ORDER].filter((mode) => modes.includes(mode))
}

export function parseMultiplayerRoom(
  raw: unknown,
): MultiplayerRoomSnapshot | null {
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id ?? raw.room_id)
  const code = stringValue(raw.code ?? raw.room_code)
  const hostUserId = stringValue(raw.host_user_id)
  const selectedModes = parseMultiplayerModes(raw.selected_modes)
  if (
    !id ||
    !code ||
    !hostUserId ||
    !selectedModes ||
    !isOneOf(raw.status, ROOM_STATUSES)
  ) {
    return null
  }
  const roundsPerMode = positiveInt(
    raw.rounds_per_mode,
    MULTIPLAYER_ROUNDS_PER_MODE,
  )
  const maxPlayers = positiveInt(raw.max_players, MULTIPLAYER_MAX_PLAYERS)
  if (
    roundsPerMode !== MULTIPLAYER_ROUNDS_PER_MODE ||
    maxPlayers < MULTIPLAYER_MIN_PLAYERS ||
    maxPlayers > MULTIPLAYER_MAX_PLAYERS
  ) {
    return null
  }
  const currentRoundIndex = nullableNonNegInt(raw.current_round_index)
  const poolSource = isOneOf(raw.pool_source, MULTIPLAYER_POOL_SOURCES)
    ? raw.pool_source
    : raw.taste === 'action' || raw.taste === 'romance'
      ? raw.taste
      : 'both'
  return {
    id,
    code,
    hostUserId,
    status: raw.status,
    selectedModes,
    roundsPerMode: MULTIPLAYER_ROUNDS_PER_MODE,
    minPlayers: MULTIPLAYER_MIN_PLAYERS,
    maxPlayers,
    memberCount: nonNegInt(raw.member_count),
    currentRoundIndex,
    taste:
      raw.taste === 'action' || raw.taste === 'romance' || raw.taste === 'both'
        ? raw.taste
        : null,
    poolSource,
    createdAt: nullableString(raw.created_at),
    startedAt: nullableString(raw.started_at),
    completedAt: nullableString(raw.completed_at),
    expiresAt: nullableString(raw.expires_at),
    phaseEndsAt: nullableString(raw.phase_ends_at),
  }
}

function parseEligibleCounts(
  raw: unknown,
): Partial<Record<MultiplayerMode, number>> {
  if (!isRecord(raw)) return {}
  return Object.fromEntries(
    MULTIPLAYER_MODE_ORDER.flatMap((mode) => {
      const value = raw[mode]
      return typeof value === 'number' && Number.isFinite(value)
        ? [[mode, Math.max(0, Math.floor(value))]]
        : []
    }),
  )
}

export function parseMultiplayerListContribution(
  raw: unknown,
): MultiplayerListContributionSnapshot | null {
  if (!isRecord(raw)) return null
  const userId = stringValue(raw.user_id)
  const listName = stringValue(raw.list_name)
  if (!userId || !listName) return null
  return {
    userId,
    username: nullableString(raw.username) ?? 'Player',
    listName,
    entryCount: nonNegInt(raw.entry_count),
    eligibleCounts: parseEligibleCounts(raw.eligible_counts),
    combinedEligibleCount: nonNegInt(raw.combined_eligible_count),
    contributedAt: nullableString(raw.contributed_at),
    sourceListId: nullableString(raw.source_list_id),
  }
}

function parsePoolSummary(raw: unknown): MultiplayerPoolSummary {
  if (!isRecord(raw)) {
    return {
      contributorCount: 0,
      requiredContributorCount: 0,
      activeMemberCount: 0,
      uniqueTitleCount: 0,
      perModeEligibleCounts: {},
      combinedEligibleCount: 0,
    }
  }
  return {
    contributorCount: nonNegInt(raw.contributor_count),
    requiredContributorCount: nonNegInt(raw.required_contributor_count),
    activeMemberCount: nonNegInt(raw.active_member_count),
    uniqueTitleCount: nonNegInt(raw.unique_title_count),
    perModeEligibleCounts: parseEligibleCounts(raw.per_mode_eligible_counts),
    combinedEligibleCount: nonNegInt(raw.combined_eligible_count),
  }
}

export function parseMultiplayerActiveRoom(
  raw: unknown,
): MultiplayerActiveRoomSummary | null {
  if (raw == null) return null
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id)
  const code = stringValue(raw.code)
  if (!id || !code || !isOneOf(raw.status, ROOM_STATUSES)) return null
  return {
    id,
    code,
    status: raw.status,
    isHost: Boolean(raw.is_host),
    memberCount: nonNegInt(raw.member_count),
    maxPlayers: Math.min(
      MULTIPLAYER_MAX_PLAYERS,
      Math.max(MULTIPLAYER_MIN_PLAYERS, nonNegInt(raw.max_players, 2)),
    ),
  }
}

function activeRoomFromResponse(
  data: Record<string, unknown> | null | undefined,
): MultiplayerActiveRoomSummary | null | undefined {
  if (!data || !('room' in data)) return undefined
  return parseMultiplayerActiveRoom(data.room)
}

export function parseMultiplayerMember(
  raw: unknown,
): MultiplayerMemberSnapshot | null {
  if (!isRecord(raw)) return null
  const userId = stringValue(raw.user_id)
  if (!userId) return null
  return {
    userId,
    username: nullableString(raw.username) ?? 'Player',
    avatarId: nullableString(raw.avatar_id),
    stageId: nullableString(raw.stage_id),
    isHost: Boolean(raw.is_host),
    isReady: Boolean(raw.is_ready),
    isActive: raw.is_active !== false,
    hasSurrendered: Boolean(raw.has_surrendered),
    score: nonNegInt(raw.score ?? raw.total_score),
    rank: nullableNonNegInt(raw.rank),
    joinedAt: nullableString(raw.joined_at),
  }
}

export function parseMultiplayerRound(
  raw: unknown,
): MultiplayerRoundSnapshot | null {
  if (!isRecord(raw)) return null
  const id = stringValue(raw.id ?? raw.round_id)
  if (
    !id ||
    !isOneOf(raw.mode, MULTIPLAYER_MODE_ORDER) ||
    !isOneOf(raw.status, ROUND_STATUSES)
  ) {
    return null
  }
  const modeRound = positiveInt(raw.mode_round ?? raw.mode_round_index, 1)
  if (modeRound > MULTIPLAYER_ROUNDS_PER_MODE) return null
  const terminal = raw.status === 'completed' || raw.status === 'cancelled'
  return {
    id,
    index: nonNegInt(raw.index ?? raw.round_index),
    mode: raw.mode,
    modeRound,
    status: raw.status,
    clue: isRecord(raw.clue ?? raw.clue_meta)
      ? (raw.clue ?? raw.clue_meta) as Record<string, unknown>
      : null,
    answerId: terminal ? nullableNonNegInt(raw.answer_id) : null,
    answerLabel: terminal ? nullableString(raw.answer_label) : null,
    maxGuesses: positiveInt(raw.max_guesses, 6),
    startsAt: nullableString(raw.starts_at),
    endsAt: nullableString(raw.ends_at),
    completedAt: nullableString(raw.completed_at),
  }
}

function parseGuessIds(value: unknown): number[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  const ids = value.map((id) =>
    typeof id === 'number' ? Math.floor(id) : Number(id),
  )
  return ids.every((id) => Number.isInteger(id) && id > 0) ? ids : null
}

function parseFeedback(value: unknown): Record<string, unknown>[] | null {
  if (value == null) return null
  if (!Array.isArray(value) || !value.every(isRecord)) return null
  return value
}

export function parseMultiplayerAttempt(
  raw: unknown,
): MultiplayerAttemptSnapshot | null {
  if (!isRecord(raw)) return null
  const roundId = stringValue(raw.round_id)
  const userId = stringValue(raw.user_id)
  if (!roundId || !userId || !isOneOf(raw.status, ATTEMPT_STATUSES)) {
    return null
  }
  return {
    roundId,
    userId,
    status: raw.status,
    guessCount: nonNegInt(raw.guess_count),
    guessIds: parseGuessIds(raw.guess_ids),
    feedback: parseFeedback(raw.feedback),
    score: nonNegInt(raw.score),
    elapsedMs: nullableNonNegInt(raw.elapsed_ms),
    finalizedAt: nullableString(raw.finalized_at),
    isViewer: Boolean(raw.is_viewer),
  }
}

function parseArray<T>(
  value: unknown,
  parser: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null
  const parsed = value.map(parser)
  return parsed.every((item): item is T => item !== null) ? parsed : null
}

export function parseMultiplayerState(
  raw: unknown,
): MultiplayerStateSnapshot | null {
  if (!isRecord(raw)) return null
  const room = parseMultiplayerRoom(raw.room)
  const members = parseArray(raw.members, parseMultiplayerMember)
  const rounds = parseArray(raw.rounds, parseMultiplayerRound)
  const attempts = parseArray(raw.attempts, parseMultiplayerAttempt)
  const listContributions = parseArray(
    raw.list_contributions ?? [],
    parseMultiplayerListContribution,
  )
  if (!room || !members || !rounds || !attempts || !listContributions) return null
  return {
    room,
    members,
    rounds,
    attempts,
    listContributions,
    poolSummary: parsePoolSummary(raw.pool_summary),
    serverNow: nullableString(raw.server_now),
    version: nonNegInt(raw.version),
  }
}

export function isMissingMultiplayerRpcError(
  message: string | null | undefined,
): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return (
    normalized.includes('schema cache') ||
    normalized.includes('could not find the function') ||
    normalized.includes('function public.multiplayer_')
  )
}

export function createMultiplayerIdempotencyKey(operation: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${operation}:${suffix}`
}

function stateFromResponse(data: Record<string, unknown>): MultiplayerStateSnapshot | null {
  return parseMultiplayerState(data.state ?? data.snapshot ?? data)
}

async function callStateRpc(
  name: string,
  args: Record<string, unknown>,
  expected: string,
): Promise<MultiplayerStateResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc(name, args)
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: isMissingMultiplayerRpcError(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : expected,
        state: isRecord(data) ? stateFromResponse(data) ?? undefined : undefined,
        activeRoom: isRecord(data) ? activeRoomFromResponse(data) : undefined,
      }
    }
    const state = stateFromResponse(data)
    return state ? { ok: true, state } : { ok: false, error: expected }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: message,
      migrationMissing: isMissingMultiplayerRpcError(message),
    }
  }
}

async function callMutationRpc(
  name: string,
  args: Record<string, unknown>,
  expected: string,
): Promise<MultiplayerMutationResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc(name, args)
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: isMissingMultiplayerRpcError(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : expected,
        state: isRecord(data) ? stateFromResponse(data) ?? undefined : undefined,
        activeRoom: isRecord(data) ? activeRoomFromResponse(data) : undefined,
      }
    }
    const state = stateFromResponse(data)
    if (!state) return { ok: false, error: expected }
    return {
      ok: true,
      state,
      created: typeof data.created === 'boolean' ? data.created : undefined,
      joined: typeof data.joined === 'boolean' ? data.joined : undefined,
      accepted: typeof data.accepted === 'boolean' ? data.accepted : undefined,
      correct: typeof data.correct === 'boolean' ? data.correct : undefined,
      finalized: typeof data.finalized === 'boolean' ? data.finalized : undefined,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: message,
      migrationMissing: isMissingMultiplayerRpcError(message),
    }
  }
}

function mutationKey(
  operation: string,
  input: MultiplayerIdempotentInput,
): string {
  return input.idempotencyKey ?? createMultiplayerIdempotencyKey(operation)
}

export function getMultiplayerState(roomId: string): Promise<MultiplayerStateResult> {
  return callStateRpc(
    'multiplayer_get_state',
    { p_room_id: roomId },
    'unexpected_multiplayer_state',
  )
}

export async function getMyActiveMultiplayerRoom(): Promise<MultiplayerActiveRoomResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'not_configured' }
  }
  try {
    const { data, error } = await supabase.rpc('multiplayer_get_my_active_room')
    if (error) {
      return {
        ok: false,
        error: error.message,
        migrationMissing: isMissingMultiplayerRpcError(error.message),
      }
    }
    if (!isRecord(data) || data.ok !== true) {
      return {
        ok: false,
        error:
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : 'unexpected_multiplayer_active_room',
        activeRoom: isRecord(data) ? activeRoomFromResponse(data) : undefined,
      }
    }
    return { ok: true, room: parseMultiplayerActiveRoom(data.room) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: message,
      migrationMissing: isMissingMultiplayerRpcError(message),
    }
  }
}

export function createMultiplayerRoom(
  input: MultiplayerIdempotentInput & {
    selectedModes: MultiplayerMode[]
    maxPlayers: number
    poolSource?: MultiplayerPoolSource
  },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_create_room',
    {
      p_selected_modes: input.selectedModes,
      p_max_players: input.maxPlayers,
      p_pool_source: input.poolSource ?? 'both',
      p_idempotency_key: mutationKey('create-room', input),
    },
    'unexpected_multiplayer_create',
  )
}

export function joinMultiplayerRoom(
  input: MultiplayerIdempotentInput & { code: string },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_join_room',
    {
      p_code: normalizeMultiplayerInviteCode(input.code),
      p_idempotency_key: mutationKey('join-room', input),
    },
    'unexpected_multiplayer_join',
  )
}

export function updateMultiplayerSettings(
  input: MultiplayerIdempotentInput & {
    roomId: string
    selectedModes: MultiplayerMode[]
    maxPlayers: number
    poolSource?: MultiplayerPoolSource
  },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_update_settings',
    {
      p_room_id: input.roomId,
      p_selected_modes: input.selectedModes,
      p_max_players: input.maxPlayers,
      p_pool_source: input.poolSource ?? 'both',
      p_idempotency_key: mutationKey('update-settings', input),
    },
    'unexpected_multiplayer_settings',
  )
}

export function setMultiplayerListContribution(
  input: MultiplayerIdempotentInput & {
    roomId: string
    listId: string | null
  },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_set_list_contribution',
    {
      p_room_id: input.roomId,
      p_list_id: input.listId,
      p_idempotency_key: mutationKey('set-list-contribution', input),
    },
    'unexpected_multiplayer_contribution',
  )
}

export function setMultiplayerReady(
  input: MultiplayerIdempotentInput & { roomId: string; ready: boolean },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_set_ready',
    {
      p_room_id: input.roomId,
      p_ready: input.ready,
      p_idempotency_key: mutationKey('set-ready', input),
    },
    'unexpected_multiplayer_ready',
  )
}

export function startMultiplayerMatch(
  input: MultiplayerIdempotentInput & { roomId: string },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_start_match',
    {
      p_room_id: input.roomId,
      p_idempotency_key: mutationKey('start-match', input),
    },
    'unexpected_multiplayer_start',
  )
}

export function submitMultiplayerGuess(
  input: MultiplayerIdempotentInput & {
    roomId: string
    roundId: string
    guessId: number
  },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_submit_guess',
    {
      p_room_id: input.roomId,
      p_round_id: input.roundId,
      p_guess_id: input.guessId,
      p_idempotency_key: mutationKey('submit-guess', input),
    },
    'unexpected_multiplayer_guess',
  )
}

export function surrenderMultiplayerRound(
  input: MultiplayerIdempotentInput & { roomId: string; roundId: string },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_surrender',
    {
      p_room_id: input.roomId,
      p_round_id: input.roundId,
      p_idempotency_key: mutationKey('surrender', input),
    },
    'unexpected_multiplayer_surrender',
  )
}

export function leaveMultiplayerRoom(
  input: MultiplayerIdempotentInput & { roomId: string },
): Promise<MultiplayerMutationResult> {
  return callMutationRpc(
    'multiplayer_leave_room',
    {
      p_room_id: input.roomId,
      p_idempotency_key: mutationKey('leave-room', input),
    },
    'unexpected_multiplayer_leave',
  )
}
