import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMultiplayerRoom,
  isMissingMultiplayerRpcError,
  isValidMultiplayerInviteCode,
  joinMultiplayerRoom,
  multiplayerErrorMessage,
  normalizeMultiplayerInviteCode,
  parseMultiplayerModes,
  parseMultiplayerState,
  setMultiplayerListContribution,
  submitMultiplayerGuess,
  updateMultiplayerSettings,
} from './multiplayerApi'

const rpc = vi.fn()

vi.mock('./supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

function stateFixture() {
  return {
    room: {
      id: 'room-1',
      code: 'ABC123',
      host_user_id: 'user-1',
      status: 'active',
      selected_modes: ['cover', 'summary'],
      rounds_per_mode: 3,
      max_players: 8,
      member_count: 2,
      current_round_index: 0,
      taste: 'both',
      pool_source: 'collaborative_lists',
      phase_ends_at: '2026-08-11T08:01:30Z',
    },
    members: [
      {
        user_id: 'user-1',
        username: 'Host',
        avatar_id: 'avatar_shadow_hunter',
        stage_id: 'stage_dusk_plaza',
        is_host: true,
        is_ready: true,
        is_active: true,
        score: 100,
      },
      {
        user_id: 'user-2',
        username: 'Guest',
        is_ready: true,
        is_active: true,
        score: 0,
      },
    ],
    rounds: [
      {
        id: 'round-1',
        index: 0,
        mode: 'summary',
        mode_round: 1,
        status: 'active',
        clue: { type: 'summary', blurbs: ['Safe clue'] },
        answer_id: 99,
        answer_label: 'Hidden while active',
        max_guesses: 6,
      },
    ],
    attempts: [
      {
        round_id: 'round-1',
        user_id: 'user-1',
        status: 'active',
        guess_count: 1,
        guess_ids: [42],
        feedback: [{ guess_id: 42 }],
        score: 0,
        is_viewer: true,
      },
      {
        round_id: 'round-1',
        user_id: 'user-2',
        status: 'active',
        guess_count: 2,
        guess_ids: null,
        feedback: null,
        score: 0,
        is_viewer: false,
      },
    ],
    list_contributions: [
      {
        user_id: 'user-1',
        username: 'Host',
        list_name: 'Shared picks',
        entry_count: 6,
        eligible_counts: { summary: 4, cover: 3 },
        combined_eligible_count: 6,
        source_list_id: 'private-list-1',
      },
      {
        user_id: 'user-2',
        username: 'Guest',
        list_name: 'Guest picks',
        entry_count: 5,
        eligible_counts: { summary: 3, cover: 3 },
        combined_eligible_count: 5,
        source_list_id: null,
      },
    ],
    pool_summary: {
      contributor_count: 2,
      required_contributor_count: 2,
      per_mode_eligible_counts: { summary: 6, cover: 6 },
      combined_eligible_count: 8,
    },
    server_now: '2026-08-11T08:00:10Z',
    version: 4,
  }
}

describe('multiplayer API contract', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('normalizes selected modes into fixed mode order', () => {
    expect(parseMultiplayerModes(['heardle', 'summary', 'cover'])).toEqual([
      'summary',
      'cover',
      'heardle',
    ])
    expect(parseMultiplayerModes([])).toBeNull()
    expect(parseMultiplayerModes(['summary', 'summary'])).toBeNull()
    expect(parseMultiplayerModes(['summary', 'unknown'])).toBeNull()
  })

  it('accepts legacy and hardened invite codes, including pasted links', () => {
    expect(isValidMultiplayerInviteCode('ABC234')).toBe(true)
    expect(isValidMultiplayerInviteCode('ABCD2345')).toBe(true)
    expect(isValidMultiplayerInviteCode('ABCDE12')).toBe(false)
    expect(isValidMultiplayerInviteCode('ABCD_234')).toBe(false)
    expect(
      normalizeMultiplayerInviteCode(
        'https://manhwadle.example/versus/abcd2345',
      ),
    ).toBe('ABCD2345')
  })

  it('maps permanent and abuse-control errors to player-facing copy', () => {
    expect(multiplayerErrorMessage('member_inactive')).toMatch(/left/i)
    expect(multiplayerErrorMessage('abuse_cooldown')).toMatch(/temporarily/i)
    expect(multiplayerErrorMessage('create_quota_exceeded')).toMatch(/daily/i)
    expect(
      multiplayerErrorMessage('selected_mode_pool_unavailable:cover'),
    ).toMatch(/private puzzles/i)
  })

  it('parses viewer-safe room, member, round, and attempt snapshots', () => {
    const parsed = parseMultiplayerState(stateFixture())
    expect(parsed).not.toBeNull()
    expect(parsed?.room).toMatchObject({
      id: 'room-1',
      selectedModes: ['summary', 'cover'],
      roundsPerMode: 3,
      minPlayers: 2,
      maxPlayers: 8,
      phaseEndsAt: '2026-08-11T08:01:30Z',
      poolSource: 'collaborative_lists',
    })
    expect(parsed?.members).toHaveLength(2)
    expect(parsed?.members[0]).toMatchObject({
      avatarId: 'avatar_shadow_hunter',
      stageId: 'stage_dusk_plaza',
    })
    expect(parsed?.members[1]).toMatchObject({
      avatarId: null,
      stageId: null,
    })
    expect(parsed?.rounds[0]?.clue).toEqual({
      type: 'summary',
      blurbs: ['Safe clue'],
    })
    expect(parsed?.rounds[0]?.answerId).toBeNull()
    expect(parsed?.rounds[0]?.answerLabel).toBeNull()
    expect(parsed?.attempts[0]?.guessIds).toEqual([42])
    expect(parsed?.attempts[1]?.guessIds).toBeNull()
    expect(parsed?.listContributions[0]).toMatchObject({
      listName: 'Shared picks',
      sourceListId: 'private-list-1',
      eligibleCounts: { summary: 4, cover: 3 },
    })
    expect(parsed?.listContributions[1]?.sourceListId).toBeNull()
    expect(parsed?.poolSummary.combinedEligibleCount).toBe(8)

    const completed = stateFixture()
    completed.rounds[0].status = 'completed'
    completed.rounds[0].answer_label = 'Terminal answer'
    expect(parseMultiplayerState(completed)?.rounds[0]).toMatchObject({
      answerId: 99,
      answerLabel: 'Terminal answer',
    })
  })

  it('rejects snapshots outside the 2-8 and three-round contract', () => {
    const badPlayers = stateFixture()
    badPlayers.room.max_players = 9
    expect(parseMultiplayerState(badPlayers)).toBeNull()

    const badRounds = stateFixture()
    badRounds.room.rounds_per_mode = 2
    expect(parseMultiplayerState(badRounds)).toBeNull()
  })

  it('calls create with selected modes and a stable caller key', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, created: true, state: stateFixture() },
      error: null,
    })
    const result = await createMultiplayerRoom({
      selectedModes: ['summary', 'cover'],
      maxPlayers: 6,
      idempotencyKey: 'create:test-1',
    })
    expect(result).toMatchObject({ ok: true, created: true })
    expect(rpc).toHaveBeenCalledWith('multiplayer_create_room', {
      p_selected_modes: ['summary', 'cover'],
      p_max_players: 6,
      p_pool_source: 'both',
      p_idempotency_key: 'create:test-1',
    })
  })

  it('updates selected modes and maximum players together', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, state: stateFixture() },
      error: null,
    })
    await updateMultiplayerSettings({
      roomId: 'room-1',
      selectedModes: ['character', 'heardle'],
      maxPlayers: 4,
      idempotencyKey: 'settings:test-1',
    })
    expect(rpc).toHaveBeenCalledWith('multiplayer_update_settings', {
      p_room_id: 'room-1',
      p_selected_modes: ['character', 'heardle'],
      p_max_players: 4,
      p_pool_source: 'both',
      p_idempotency_key: 'settings:test-1',
    })
  })

  it('sets or clears only the caller contribution snapshot', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, state: stateFixture() },
      error: null,
    })
    await setMultiplayerListContribution({
      roomId: 'room-1',
      listId: 'private-list-1',
      idempotencyKey: 'contribution:test-1',
    })
    expect(rpc).toHaveBeenCalledWith(
      'multiplayer_set_list_contribution',
      {
        p_room_id: 'room-1',
        p_list_id: 'private-list-1',
        p_idempotency_key: 'contribution:test-1',
      },
    )
  })

  it('normalizes a pasted invite link before joining', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, joined: true, state: stateFixture() },
      error: null,
    })
    await joinMultiplayerRoom({
      code: 'https://manhwadle.example/versus/abcd2345',
      idempotencyKey: 'join:test-1',
    })
    expect(rpc).toHaveBeenCalledWith('multiplayer_join_room', {
      p_code: 'ABCD2345',
      p_idempotency_key: 'join:test-1',
    })
  })

  it('submits guesses with round scope and idempotency', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        accepted: true,
        correct: false,
        finalized: true,
        reason: 'round_completed',
        state: stateFixture(),
      },
      error: null,
    })
    const result = await submitMultiplayerGuess({
      roomId: 'room-1',
      roundId: 'round-1',
      guessId: 42,
      idempotencyKey: 'guess:test-1',
    })
    expect(result).toMatchObject({
      ok: true,
      accepted: true,
      correct: false,
      finalized: true,
      reason: 'round_completed',
    })
    expect(rpc).toHaveBeenCalledWith('multiplayer_submit_guess', {
      p_room_id: 'room-1',
      p_round_id: 'round-1',
      p_guess_id: 42,
      p_idempotency_key: 'guess:test-1',
    })
  })

  it('marks absent multiplayer RPCs as migration missing', () => {
    expect(
      isMissingMultiplayerRpcError(
        'Could not find the function public.multiplayer_get_state in the schema cache',
      ),
    ).toBe(true)
    expect(isMissingMultiplayerRpcError('room_full')).toBe(false)
  })
})
