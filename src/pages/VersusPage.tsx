import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'
import { ModeGlyph } from '../components/ModeGlyph'
import { SavedListManagerDialog } from '../components/SavedListManagerDialog'
import { MultiplayerCapacityPicker } from '../components/multiplayer/MultiplayerCapacityPicker'
import { MultiplayerContributionPanel } from '../components/multiplayer/MultiplayerContributionPanel'
import { MultiplayerModePicker } from '../components/multiplayer/MultiplayerModePicker'
import { MultiplayerPoolPicker } from '../components/multiplayer/MultiplayerPoolPicker'
import { multiplayerPoolLabel } from '../components/multiplayer/multiplayerPoolMeta'
import {
  multiplayerModeGlyphKey,
  multiplayerModeLabel,
} from '../components/multiplayer/multiplayerModeMeta'
import {
  MultiplayerRoster,
  type MultiplayerRosterMember,
} from '../components/multiplayer/MultiplayerRoster'
import {
  MultiplayerMatchRecap,
  type MultiplayerRecapEntry,
} from '../components/multiplayer/MultiplayerMatchRecap'
import { MultiplayerRoundProgress } from '../components/multiplayer/MultiplayerRoundProgress'
import { MultiplayerRoundReveal } from '../components/multiplayer/MultiplayerRoundReveal'
import { MultiplayerRoundBoard } from '../components/multiplayer/MultiplayerRoundBoard'
import { MultiplayerSurrenderControl } from '../components/multiplayer/MultiplayerSurrenderControl'
import { MultiplayerTimer } from '../components/multiplayer/MultiplayerTimer'
import { VersusAvatarPreview } from '../components/multiplayer/VersusAvatarPreview'
import { VersusEffectLayer } from '../components/multiplayer/VersusEffectLayer'
import { KnownInfoPanel } from '../components/KnownInfoPanel'
import { useMultiplayerRoom } from '../hooks/useMultiplayerRoom'
import type { Manhwa } from '../lib/anilist-types'
import { copyTextToClipboard } from '../lib/clipboard'
import { loadClientCatalog } from '../lib/clientCatalog'
import { displayTitle } from '../lib/daily'
import { buildKnownInfo } from '../lib/knowledge'
import {
  createMultiplayerIdempotencyKey,
  createMultiplayerRoom,
  getMyActiveMultiplayerRoom,
  isValidMultiplayerInviteCode,
  joinMultiplayerRoom,
  leaveMultiplayerRoom,
  multiplayerErrorMessage,
  normalizeMultiplayerInviteCode,
  setMultiplayerReady,
  setMultiplayerListContribution,
  startMultiplayerMatch,
  submitMultiplayerGuess,
  surrenderMultiplayerRound,
  updateMultiplayerSettings,
} from '../lib/multiplayerApi'
import { buildMultiplayerFeedbackRows } from '../lib/multiplayerFeedback'
import {
  MULTIPLAYER_INTERMISSION_MS,
  MULTIPLAYER_MIN_PLAYERS,
  MULTIPLAYER_ROUND_MS,
  MULTIPLAYER_ROUNDS_PER_MODE,
  type MultiplayerActiveRoomSummary,
  type MultiplayerMode,
  type MultiplayerMutationResult,
  type MultiplayerPoolSource,
  type MultiplayerRoomStatus,
  type MultiplayerStateSnapshot,
} from '../lib/multiplayerTypes'
import { collectVersusCueEvents } from '../lib/versusCueOrchestrator'
import type { VersusEffectId } from '../lib/versusEffects'
import { playVersusSound } from '../lib/versusSounds'
import {
  multiplayerClockOffsetMs,
  multiplayerRemainingMs,
} from '../lib/multiplayerTime'
import {
  leaveMultiplayerPage,
  multiplayerInteractionsBlocked,
} from '../lib/multiplayerPageActions'
import {
  listSavedLists,
  SAVED_LIST_MAX_COUNT,
  type SavedListSummary,
} from '../lib/savedListsApi'
import { versusRoomPath } from '../lib/routes'
import { findById } from '../lib/search'

function mutationError(result: MultiplayerMutationResult): string | null {
  return result.ok
    ? null
    : multiplayerErrorMessage(
        result.migrationMissing ? 'migration_missing' : result.error,
      )
}

function phaseLabel(
  status: MultiplayerRoomStatus,
  roundNumber: number | null,
  totalRounds: number,
): string {
  switch (status) {
    case 'lobby':
      return 'Lobby'
    case 'countdown':
      return 'Starting'
    case 'active':
      return roundNumber ? `Round ${roundNumber}/${totalRounds}` : 'In play'
    case 'intermission':
      return 'Between rounds'
    case 'completed':
      return 'Complete'
    default:
      return 'Closed'
  }
}

const HOW_IT_WORKS = [
  {
    title: 'Pick the modes',
    detail: `${MULTIPLAYER_ROUNDS_PER_MODE} rounds each, played in a fixed order.`,
  },
  { title: 'Share the invite', detail: 'Copy the invite code and send it to your friends.' },
  { title: 'Ready up', detail: 'The host starts once every player is ready.' },
]

function activeRoomPhaseLabel(status: MultiplayerRoomStatus): string {
  switch (status) {
    case 'lobby':
      return 'Lobby'
    case 'countdown':
      return 'Starting'
    case 'active':
    case 'intermission':
      return 'In play'
    case 'completed':
      return 'Complete'
    default:
      return 'Closed'
  }
}

export function VersusPage() {
  const { roomId: roomIdParam } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { user, configured, loading: authLoading, needsUsername } = useAuth()
  const inviteCodeFromPath =
    roomIdParam && isValidMultiplayerInviteCode(roomIdParam)
      ? normalizeMultiplayerInviteCode(roomIdParam)
      : null
  const roomId = inviteCodeFromPath ? undefined : roomIdParam
  const [catalog, setCatalog] = useState<Manhwa[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)
  const [selectedModes, setSelectedModes] = useState<MultiplayerMode[]>(['summary'])
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [poolSource, setPoolSource] = useState<MultiplayerPoolSource>('both')
  const [savedLists, setSavedLists] = useState<SavedListSummary[]>([])
  const [listManagerOpen, setListManagerOpen] = useState(false)
  const [joinCode, setJoinCode] = useState(inviteCodeFromPath ?? '')
  const [pending, setPending] = useState(false)
  const [readyDebounced, setReadyDebounced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeRoom, setActiveRoom] = useState<MultiplayerActiveRoomSummary | null>(null)
  const [activeRoomLoading, setActiveRoomLoading] = useState(false)
  const [guessCue, setGuessCue] = useState<{
    effect: 'correct-guess' | 'incorrect-guess'
    run: number
  } | null>(null)
  const [rosterCues, setRosterCues] = useState<
    Record<string, { outcome: 'solve' | 'fail'; run: number }>
  >({})
  const [scoreCue, setScoreCue] = useState<{ userId: string; run: number } | null>(null)
  const [overlayCue, setOverlayCue] = useState<{
    effect: Extract<VersusEffectId, 'match-victory' | 'match-defeat' | 'match-draw'>
    run: number
  } | null>(null)
  const [countdownStep, setCountdownStep] = useState<3 | 2 | 1>(3)
  const syncedSettingsRef = useRef('')
  const readyDebounceTimerRef = useRef<number | null>(null)
  const cueSnapshotRef = useRef<MultiplayerStateSnapshot | null>(null)
  const cueRunRef = useRef(0)
  const cueTimersRef = useRef<number[]>([])
  const roomState = useMultiplayerRoom(roomId, {
    enabled: Boolean(user && roomId),
  })
  const state = roomState.state

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(false)
    try {
      setCatalog(await loadClientCatalog())
    } catch {
      setCatalogError(true)
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  const refreshActiveRoom = useCallback(async () => {
    if (!user || roomId) {
      setActiveRoom(null)
      setActiveRoomLoading(false)
      return
    }
    setActiveRoomLoading(true)
    const result = await getMyActiveMultiplayerRoom()
    setActiveRoomLoading(false)
    if (result.ok) {
      setActiveRoom(result.room)
      return
    }
    if (result.activeRoom) setActiveRoom(result.activeRoom)
  }, [roomId, user])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    void refreshActiveRoom()
  }, [refreshActiveRoom])

  useEffect(() => {
    if (!user) {
      setSavedLists([])
      return
    }
    void listSavedLists().then((result) => {
      if (result.ok) setSavedLists(result.value)
    })
  }, [user])

  useEffect(() => {
    if (!state || state.room.status !== 'lobby') return
    const settingsKey = `${state.room.id}:${state.room.selectedModes.join(',')}:${state.room.maxPlayers}:${state.room.poolSource}`
    if (syncedSettingsRef.current === settingsKey) return
    syncedSettingsRef.current = settingsKey
    setSelectedModes(state.room.selectedModes)
    setMaxPlayers(state.room.maxPlayers)
    setPoolSource(state.room.poolSource)
  }, [state])

  useEffect(() => {
    if (!state) return
    const events = collectVersusCueEvents(cueSnapshotRef.current, state, user?.id ?? '')
    cueSnapshotRef.current = state
    let soundIndex = 0

    for (const event of events) {
      if ('sound' in event && event.sound) {
        const sound = event.sound
        const timer = window.setTimeout(() => {
          void playVersusSound(sound, { volume: 0.55 })
        }, soundIndex * 140)
        cueTimersRef.current.push(timer)
        soundIndex += 1
      }

      const run = cueRunRef.current + 1
      cueRunRef.current = run
      if (event.kind === 'guess') {
        setGuessCue({ effect: event.effect, run })
        const timer = window.setTimeout(() => {
          setGuessCue((current) => (current?.run === run ? null : current))
        }, 1_050)
        cueTimersRef.current.push(timer)
      } else if (event.kind === 'roster') {
        setRosterCues((current) => ({
          ...current,
          [event.userId]: { outcome: event.outcome, run },
        }))
        const timer = window.setTimeout(() => {
          setRosterCues((current) => {
            if (current[event.userId]?.run !== run) return current
            const nextCues = { ...current }
            delete nextCues[event.userId]
            return nextCues
          })
        }, 1_100)
        cueTimersRef.current.push(timer)
      } else if (event.kind === 'score') {
        setScoreCue({ userId: event.userId, run })
        const timer = window.setTimeout(() => {
          setScoreCue((current) => (current?.run === run ? null : current))
        }, 1_000)
        cueTimersRef.current.push(timer)
      } else if (event.kind === 'overlay') {
        setOverlayCue({ effect: event.effect, run })
        const timer = window.setTimeout(() => {
          setOverlayCue((current) => (current?.run === run ? null : current))
        }, 3_200)
        cueTimersRef.current.push(timer)
      }
    }
  }, [state, user?.id])

  useEffect(() => {
    if (!state || state.room.status !== 'countdown') {
      setCountdownStep(3)
      return
    }
    const endsAt =
      state.rounds.find((round) => round.index === state.room.currentRoundIndex)?.startsAt ??
      state.room.phaseEndsAt
    const offsetMs = multiplayerClockOffsetMs(state.serverNow)
    const update = () => {
      const seconds = Math.max(
        1,
        Math.min(3, Math.ceil(multiplayerRemainingMs(endsAt, offsetMs) / 1_000)),
      ) as 3 | 2 | 1
      setCountdownStep(seconds)
    }
    update()
    const timer = window.setInterval(update, 100)
    return () => window.clearInterval(timer)
  }, [state])

  useEffect(() => {
    if (state?.room.status !== 'countdown') return
    void playVersusSound('countdown', {
      volume: 0.55,
      countdownStep,
    })
  }, [countdownStep, state?.room.status])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2_000)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!inviteCodeFromPath) return
    setJoinCode(inviteCodeFromPath)
    try {
      sessionStorage.setItem('manhwadle:versus-pending-invite', inviteCodeFromPath)
    } catch {
      // private mode — join field still holds the code for this tab
    }
  }, [inviteCodeFromPath])

  useEffect(() => {
    if (inviteCodeFromPath || joinCode) return
    try {
      const stashed = sessionStorage.getItem('manhwadle:versus-pending-invite')
      if (!stashed || !isValidMultiplayerInviteCode(stashed)) return
      setJoinCode(normalizeMultiplayerInviteCode(stashed))
    } catch {
      // ignore
    }
  }, [inviteCodeFromPath, joinCode])

  useEffect(() => () => {
    if (readyDebounceTimerRef.current !== null) {
      window.clearTimeout(readyDebounceTimerRef.current)
    }
    cueTimersRef.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  async function runMutation(
    operation: () => Promise<MultiplayerMutationResult>,
    options?: { navigateToRoom?: boolean },
  ): Promise<boolean> {
    if (pending) return false
    if (roomId && roomState.error) {
      setError('Room state is out of date. Reconnect before making changes.')
      return false
    }
    setPending(true)
    setError(null)
    let result: MultiplayerMutationResult
    try {
      result = await operation()
    } catch {
      setPending(false)
      setError('The request could not be completed. Please try again.')
      return false
    }
    setPending(false)
    if (!result.ok && result.activeRoom) {
      setActiveRoom(result.activeRoom)
    }
    const nextError = mutationError(result)
    if (nextError) {
      setError(nextError)
      return false
    }
    if (!result.ok) return false
    if (options?.navigateToRoom) {
      try {
        sessionStorage.removeItem('manhwadle:versus-pending-invite')
      } catch {
        // ignore
      }
      navigate(versusRoomPath(result.state.room.id))
      return true
    }
    await roomState.refresh()
    return true
  }

  async function leaveActiveSeat() {
    if (!activeRoom || pending) return
    setPending(true)
    setError(null)
    const result = await leaveMultiplayerRoom({
      roomId: activeRoom.id,
      idempotencyKey: createMultiplayerIdempotencyKey('leave-room'),
    })
    setPending(false)
    if (!result.ok) {
      setError(multiplayerErrorMessage(
        result.migrationMissing ? 'migration_missing' : result.error,
      ))
      return
    }
    setActiveRoom(null)
    setError(null)
  }

  async function copyInvite(code: string) {
    const inviteCode = normalizeMultiplayerInviteCode(code)
    const ok = await copyTextToClipboard(inviteCode)
    if (ok) {
      setCopied(true)
      setError(null)
      return
    }
    setError(`Could not copy automatically. Share this invite code: ${code}`)
  }

  function updateJoinCode(value: string) {
    const normalized = normalizeMultiplayerInviteCode(value)
    if (/[^A-Z2-9]/.test(normalized)) return
    setJoinCode(normalized.slice(0, 8))
  }

  async function toggleReady(roomId: string, ready: boolean) {
    if (readyDebounced) return
    setReadyDebounced(true)
    await runMutation(() => setMultiplayerReady({
      roomId,
      ready,
      idempotencyKey: createMultiplayerIdempotencyKey('set-ready'),
    }))
    readyDebounceTimerRef.current = window.setTimeout(() => {
      setReadyDebounced(false)
      readyDebounceTimerRef.current = null
    }, 1_000)
  }

  if (authLoading) {
    return (
      <main className="versus-page">
        <div className="versus-empty" aria-busy="true">Loading account…</div>
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="versus-page">
        <div className="versus-empty">
          <h1>Versus unavailable</h1>
          <p>Supabase is not configured for this build.</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="versus-page">
        <div className="versus-empty">
          <h1>Sign in to play Versus</h1>
          <p>Versus rooms require a signed-in account with a username.</p>
          <Link className="btn btn-primary" to="/">
            Back home
          </Link>
        </div>
      </main>
    )
  }

  if (needsUsername) {
    return (
      <main className="versus-page">
        <div className="versus-empty">
          <h1>Choose a username</h1>
          <p>Finish account setup before creating or joining a Versus room.</p>
        </div>
      </main>
    )
  }

  if (!roomId) {
    const plannedRounds = selectedModes.length * MULTIPLAYER_ROUNDS_PER_MODE
    return (
      <main className="versus-page">
        <header className="versus-hero">
          <div className="versus-hero-copy">
            <p className="versus-kicker">Multiplayer</p>
            <h1 className="versus-title">Versus</h1>
            <p className="versus-subtitle">Compete against your friends!</p>
          </div>
          <ol className="versus-steps">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title}>
                <span className="versus-step-num" aria-hidden="true">{index + 1}</span>
                <span className="versus-step-copy">
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </span>
              </li>
            ))}
          </ol>
        </header>
        {import.meta.env.DEV && <VersusAvatarPreview />}
        {error && <p className="versus-error" role="alert">{error}</p>}
        {activeRoomLoading && !activeRoom ? (
          <p className="versus-hint" aria-busy="true">Checking for an open room…</p>
        ) : null}
        {activeRoom && (
          <section className="versus-active-room" aria-label="Open Versus room">
            <div>
              <h2>You still have an open room</h2>
              <p className="versus-muted">
                Closing the tab does not leave the seat. Resume{' '}
                <strong>{activeRoom.code}</strong>
                {` (${activeRoomPhaseLabel(activeRoom.status)})`} or leave before
                creating or joining another.
              </p>
            </div>
            <div className="versus-active-room-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={pending}
                onClick={() => navigate(versusRoomPath(activeRoom.id))}
              >
                Resume room
              </button>
              <button
                className="btn"
                type="button"
                disabled={pending}
                onClick={() => void leaveActiveSeat()}
              >
                {pending ? 'Leaving…' : activeRoom.status === 'lobby' ? 'Leave lobby' : 'Leave room'}
              </button>
            </div>
          </section>
        )}
        <div className="versus-grid">
          <section className="versus-panel">
            <div className="versus-panel-head">
              <div>
                <h2>Create a room</h2>
                <p className="versus-muted">You host, so you control modes and seats.</p>
              </div>
              <span className="versus-chip">{plannedRounds} rounds</span>
            </div>
            <div className="versus-form">
              <MultiplayerModePicker
                selected={selectedModes}
                onChange={setSelectedModes}
                disabled={pending}
              />
              <MultiplayerPoolPicker
                value={poolSource}
                onChange={setPoolSource}
                disabled={pending}
              />
              <MultiplayerCapacityPicker
                value={maxPlayers}
                disabled={pending}
                onChange={setMaxPlayers}
              />
              <button
                className="btn btn-primary btn-cta"
                type="button"
                disabled={pending}
                onClick={() => void runMutation(
                  () => createMultiplayerRoom({
                    selectedModes,
                    maxPlayers,
                    poolSource,
                    idempotencyKey: createMultiplayerIdempotencyKey('create-room'),
                  }),
                  { navigateToRoom: true },
                )}
              >
                {pending ? 'Creating…' : 'Create room'}
              </button>
            </div>
          </section>
          <div className="versus-side">
          <section className="versus-panel">
            <div className="versus-panel-head">
              <div>
                <h2>Join a room</h2>
                <p className="versus-muted">Enter the invite code from the host.</p>
              </div>
            </div>
            <div className="versus-form">
              <label className="versus-field">
                <span className="versus-label">Invite code</span>
                <input
                  className="versus-code"
                  value={joinCode}
                  maxLength={8}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => updateJoinCode(event.target.value)}
                  placeholder="Invite code"
                />
              </label>
              <p className="versus-hint">
                Enter the 8-character invite code (6-character invites still work).
              </p>
              <button
                className="btn btn-primary btn-cta"
                type="button"
                disabled={pending || !isValidMultiplayerInviteCode(joinCode)}
                onClick={() => void runMutation(
                  () => joinMultiplayerRoom({
                    code: joinCode,
                    idempotencyKey: createMultiplayerIdempotencyKey('join-room'),
                  }),
                  { navigateToRoom: true },
                )}
              >
                {pending ? 'Joining…' : 'Join room'}
              </button>
            </div>
          </section>
          <section className="versus-panel">
            <div className="versus-panel-head">
              <div>
                <h2>Saved lists</h2>
                <p className="versus-muted">
                  Your own title pools for collaborative rooms.
                </p>
              </div>
              {savedLists.length > 0 && (
                <span className="versus-chip">
                  {savedLists.length}/{SAVED_LIST_MAX_COUNT}
                </span>
              )}
            </div>
            {savedLists.length > 0 ? (
              <ul className="versus-list-preview">
                {savedLists.slice(0, 3).map((list) => (
                  <li key={list.id}>
                    <strong>{list.name}</strong>
                    <small>
                      {list.entryCount} title{list.entryCount === 1 ? '' : 's'}
                    </small>
                  </li>
                ))}
                {savedLists.length > 3 && (
                  <li className="versus-list-preview-more">
                    +{savedLists.length - 3} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="versus-hint">
                No lists yet. Build one to host a room from your own titles.
              </p>
            )}
            <button
              className="btn"
              type="button"
              onClick={() => setListManagerOpen(true)}
            >
              {savedLists.length > 0 ? 'Manage lists' : 'Create a list'}
            </button>
          </section>
          </div>
        </div>
        <SavedListManagerDialog
          open={listManagerOpen}
          onClose={() => setListManagerOpen(false)}
          catalog={catalog}
          onListsChange={setSavedLists}
        />
      </main>
    )
  }

  if (!state && roomState.error) {
    return (
      <main className="versus-page">
        <div className="versus-empty">
          <h1>Room unavailable</h1>
          <p className="versus-error" role="alert">
            {multiplayerErrorMessage(roomState.error.error)}
          </p>
          <Link className="btn btn-primary" to={versusRoomPath()}>
            Back to Versus
          </Link>
        </div>
      </main>
    )
  }

  if (roomState.loading || !state) {
    return (
      <main className="versus-page" aria-busy="true">
        <div className="versus-empty">
          <h1>Joining room…</h1>
        </div>
      </main>
    )
  }

  const room = state.room
  const self = state.members.find((member) => member.userId === user?.id) ?? null
  if (
    self &&
    !self.isActive &&
    !['completed', 'cancelled', 'expired'].includes(room.status)
  ) {
    return (
      <main className="versus-page">
        <div className="versus-empty">
          <h1>You left this match</h1>
          <p>This room is still running, but it no longer accepts requests from your account.</p>
          <Link className="btn btn-primary" to={versusRoomPath()}>
            Back to Versus
          </Link>
        </div>
      </main>
    )
  }
  const currentRound =
    room.currentRoundIndex == null
      ? null
      : state.rounds.find((round) => round.index === room.currentRoundIndex) ?? null
  const attemptsForRound = currentRound
    ? state.attempts.filter((attempt) => attempt.roundId === currentRound.id)
    : []
  const ownAttempt =
    attemptsForRound.find((attempt) => attempt.userId === user?.id) ?? null
  const roster: MultiplayerRosterMember[] = state.members.map((member, index) => {
    const attempt = attemptsForRound.find((candidate) => candidate.userId === member.userId)
    return {
      userId: member.userId,
      username: member.username,
      avatarId: member.avatarId,
      stageId: member.stageId,
      seat: index + 1,
      ready: member.isReady,
      status: member.isActive ? 'active' : 'withdrawn',
      totalScore: member.score,
      placement: member.rank,
      guessCount: attempt?.guessCount ?? 0,
      attemptStatus: attempt?.status,
      isHost: member.isHost,
      isSelf: member.userId === user?.id,
    }
  })
  const rosterOutcomeEmphasis: Record<string, 'solve' | 'fail'> = Object.fromEntries(
    Object.entries(rosterCues).map(([userId, cue]) => [userId, cue.outcome]),
  )

  async function leaveRoom() {
    await leaveMultiplayerPage(
      () => runMutation(() => leaveMultiplayerRoom({
        roomId: room.id,
        idempotencyKey: createMultiplayerIdempotencyKey('leave-room'),
      })),
      () => navigate(versusRoomPath()),
    )
  }

  const feedback = buildMultiplayerFeedbackRows(
    ownAttempt?.feedback ?? null,
    ownAttempt?.guessIds ?? null,
    catalog,
  )
  const revealedCatalogAnswer = currentRound?.answerId
    ? findById(catalog, currentRound.answerId)
    : null
  const revealedAnswer = revealedCatalogAnswer
    ? displayTitle(revealedCatalogAnswer)
    : currentRound?.answerLabel ?? null

  const totalRounds = room.selectedModes.length * room.roundsPerMode
  const roundNumber = currentRound ? currentRound.index + 1 : null
  const readyCount = state.members.filter((member) => member.isReady).length
  const roomInteractionBlocked = multiplayerInteractionsBlocked(pending, roomState.error)
  const missingPlayers = Math.max(0, MULTIPLAYER_MIN_PLAYERS - state.members.length)
  const everyoneReady = state.members.every((member) => member.isReady)
  const settingsDirty =
    selectedModes.join(',') !== room.selectedModes.join(',') ||
    maxPlayers !== room.maxPlayers ||
    poolSource !== room.poolSource
  const needsSharedList =
    room.poolSource === 'collaborative_lists' &&
    state.poolSummary.contributorCount <
      Math.max(1, state.poolSummary.requiredContributorCount)
  const insufficientMode = room.poolSource === 'collaborative_lists'
    ? room.selectedModes.find(
        (mode) => (state.poolSummary.perModeEligibleCounts[mode] ?? 0) < 3,
      )
    : undefined
  const tooFewCombined =
    room.poolSource === 'collaborative_lists' &&
    state.poolSummary.combinedEligibleCount <
      room.selectedModes.length * MULTIPLAYER_ROUNDS_PER_MODE
  const startBlocked = missingPlayers > 0
    ? `Needs ${missingPlayers} more player${missingPlayers === 1 ? '' : 's'}.`
    : needsSharedList
      ? 'At least one player has to share a saved list.'
      : insufficientMode
        ? `${multiplayerModeLabel(insufficientMode)} needs at least 3 eligible unique titles.`
        : tooFewCombined
          ? `The combined pool needs ${room.selectedModes.length * MULTIPLAYER_ROUNDS_PER_MODE} unique eligible titles for a no-repeat match.`
    : !everyoneReady
      ? 'Everyone has to be ready first.'
      : null
  const leader = [...roster].sort(
    (left, right) => right.totalScore - left.totalScore || left.seat - right.seat,
  )[0]
  // Answers unlock per round as they finish, so the recap grows with the match.
  const recapEntries: MultiplayerRecapEntry[] = state.rounds
    .filter((round) => round.answerId != null || round.answerLabel != null)
    .map((round) => ({
      roundIndex: round.index,
      mode: round.mode,
      modeRound: round.modeRound,
      answerId: round.answerId,
      answerLabel: round.answerLabel,
      solvedBy: state.attempts
        .filter((attempt) => attempt.roundId === round.id && attempt.status === 'won')
        .map((attempt) =>
          attempt.isViewer
            ? 'You'
            : state.members.find((member) => member.userId === attempt.userId)?.username ??
              'Player',
        ),
    }))

  return (
    <main className="versus-page">
      {import.meta.env.DEV && <VersusAvatarPreview />}
      <header className="versus-room-head">
        <div className="versus-room-id">
          <p className="versus-kicker">Room code</p>
          <p className="versus-room-code">{room.code}</p>
          <p className="versus-muted">
            {totalRounds} rounds · {room.memberCount}/{room.maxPlayers} players ·{' '}
            {room.selectedModes.map((mode) => multiplayerModeLabel(mode)).join(', ')}
            {' · '}{multiplayerPoolLabel(room.poolSource)}
          </p>
        </div>
        <div className="versus-room-meta">
          <span className={`versus-phase is-${room.status}`}>
            {phaseLabel(room.status, roundNumber, totalRounds)}
          </span>
          <div className="versus-actions">
            <button className="btn" type="button" onClick={() => void copyInvite(room.code)}>
              {copied ? 'Invite code copied' : 'Copy invite'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={roomInteractionBlocked}
              onClick={() => void leaveRoom()}
            >
              Leave
            </button>
          </div>
        </div>
      </header>

      {(error || roomState.error) && (
        <div className="versus-error" role="alert">
          <p>{error ?? multiplayerErrorMessage(roomState.error!.error)}</p>
          {roomState.error && (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={roomState.refreshing}
              onClick={() => void roomState.refresh()}
            >
              {roomState.refreshing ? 'Reconnecting…' : 'Reconnect'}
            </button>
          )}
        </div>
      )}

      {room.status === 'cancelled' || room.status === 'expired' ? (
        <section className="versus-panel versus-closed">
          <p className="versus-kicker">{room.status === 'cancelled' ? 'Cancelled' : 'Expired'}</p>
          <h2>{room.status === 'cancelled' ? 'Room cancelled' : 'Room expired'}</h2>
          <p className="versus-muted">This room is no longer active.</p>
          <button className="btn btn-primary" type="button" onClick={() => navigate(versusRoomPath())}>
            Find another room
          </button>
        </section>
      ) : room.status === 'lobby' ? (
        <div className="versus-grid">
          <section className="versus-panel">
            <div className="versus-panel-head">
              <div>
                <h2>Players</h2>
                <p className="versus-muted">
                  {readyCount}/{state.members.length} ready
                  {startBlocked ? ` · ${startBlocked}` : ' · good to go'}
                </p>
              </div>
              <span className="versus-chip">
                {room.memberCount}/{room.maxPlayers}
              </span>
            </div>
            <MultiplayerRoster members={roster} maxPlayers={room.maxPlayers} />
          </section>
          <section className="versus-panel">
            <div className="versus-panel-head">
              <div>
                <h2>Match settings</h2>
                <p className="versus-muted">
                  {self?.isHost
                    ? 'Save changes to push them to the room.'
                    : 'Only the host can change these.'}
                </p>
              </div>
              <span className="versus-chip">
                {selectedModes.length * MULTIPLAYER_ROUNDS_PER_MODE} rounds
              </span>
            </div>
            <div className="versus-form">
              <MultiplayerModePicker
                selected={selectedModes}
                disabled={!self?.isHost || roomInteractionBlocked}
                onChange={setSelectedModes}
              />
              <MultiplayerPoolPicker
                value={poolSource}
                disabled={!self?.isHost || roomInteractionBlocked}
                onChange={setPoolSource}
              />
              <MultiplayerCapacityPicker
                value={maxPlayers}
                floor={room.memberCount}
                disabled={!self?.isHost || roomInteractionBlocked}
                onChange={setMaxPlayers}
              />
              {self?.isHost && settingsDirty && (
                <button
                  className="btn versus-save"
                  type="button"
                  disabled={roomInteractionBlocked}
                  onClick={() => void runMutation(() => updateMultiplayerSettings({
                    roomId: room.id,
                    selectedModes,
                    maxPlayers,
                    poolSource,
                    idempotencyKey: createMultiplayerIdempotencyKey('update-settings'),
                  }))}
                >
                  Save settings
                </button>
              )}
              {room.poolSource === 'collaborative_lists' && (
                <MultiplayerContributionPanel
                  viewerUserId={user.id}
                  contributions={state.listContributions}
                  summary={state.poolSummary}
                  savedLists={savedLists}
                  disabled={roomInteractionBlocked}
                  onManageLists={() => setListManagerOpen(true)}
                  onContribute={(listId) => void runMutation(() =>
                    setMultiplayerListContribution({
                      roomId: room.id,
                      listId,
                      idempotencyKey: createMultiplayerIdempotencyKey(
                        'set-list-contribution',
                      ),
                    })
                  )}
                />
              )}
            </div>
            <div className="versus-panel-foot">
              <button
                className={`btn btn-cta${self?.isReady ? ' btn-ghost' : ' btn-primary'}`}
                type="button"
                disabled={pending || readyDebounced}
                onClick={() => void toggleReady(room.id, !self?.isReady)}
              >
                {self?.isReady ? 'Cancel ready' : "I'm ready"}
              </button>
              {self?.isHost ? (
                <>
                  <button
                    className="btn btn-primary btn-cta"
                    type="button"
                    disabled={roomInteractionBlocked || Boolean(startBlocked)}
                    onClick={() => void runMutation(() => startMultiplayerMatch({
                      roomId: room.id,
                      idempotencyKey: createMultiplayerIdempotencyKey('start-match'),
                    }))}
                  >
                    Start match
                  </button>
                  {startBlocked && <p className="versus-hint">{startBlocked}</p>}
                </>
              ) : (
                <p className="versus-hint">Waiting for the host to start the match.</p>
              )}
            </div>
          </section>
        </div>
      ) : room.status === 'completed' ? (
        <section className="versus-panel versus-final">
          {overlayCue && (
            <VersusEffectLayer
              key={`${overlayCue.effect}-${overlayCue.run}`}
              effect={overlayCue.effect}
            />
          )}
          <div className="versus-panel-head">
            <div>
              <p className="versus-kicker">Match complete</p>
              <h2>Final standings</h2>
              {leader && (
                <p className="versus-muted">
                  {leader.isSelf ? 'You take the match' : `${leader.username} takes the match`} with{' '}
                  {leader.totalScore.toLocaleString()} points.
                </p>
              )}
            </div>
            <span className="versus-chip">{totalRounds} rounds</span>
          </div>
          <div
            className={`versus-battle-standings is-count-${roster.length}${
              roster.length > 4 ? ' is-crowded' : ''
            }`}
          >
            <MultiplayerRoster
              members={roster}
              maxPlayers={room.maxPlayers}
              showScores
              outcomeEmphasis={rosterOutcomeEmphasis}
              scoreEmphasisUserId={scoreCue?.userId}
            />
          </div>
          <MultiplayerMatchRecap
            entries={recapEntries}
            catalog={catalog}
            roundsPerMode={room.roundsPerMode}
          />
          <div className="versus-panel-foot">
            <button className="btn btn-primary" type="button" onClick={() => navigate('/')}>
              Back home
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => navigate(versusRoomPath())}>
              New room
            </button>
          </div>
        </section>
      ) : (
        <div
          className={`versus-battle-layout${
            room.status === 'active' && ownAttempt ? ' has-known' : ''
          }`}
        >
          <aside
            className={`versus-battle-standings is-count-${roster.length}${
              roster.length > 4 ? ' is-crowded' : ''
            }`}
            aria-label="Live standings"
          >
            <MultiplayerRoster
              members={roster}
              maxPlayers={room.maxPlayers}
              showScores
              outcomeEmphasis={rosterOutcomeEmphasis}
              scoreEmphasisUserId={scoreCue?.userId}
            />
          </aside>
          <section
            className={`versus-panel versus-match-main versus-battle-board${
              guessCue ? ` is-inline-${guessCue.effect}` : ''
            }`}
          >
            {room.status === 'countdown' ? (
              <div className="versus-countdown">
                <p className="versus-kicker">Get ready</p>
                <div className="versus-countdown-stage">
                  <VersusEffectLayer
                    key={`countdown-${countdownStep}`}
                    effect="countdown"
                    message={String(countdownStep)}
                  />
                  <span
                    className="visually-hidden"
                    role="timer"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    Round starts in {countdownStep}
                  </span>
                </div>
                {currentRound && (
                  <p className="versus-muted">
                    Up first: {multiplayerModeLabel(currentRound.mode)} · Round{' '}
                    {currentRound.index + 1} of {totalRounds}
                  </p>
                )}
              </div>
            ) : room.status === 'intermission' ? (
              <div className="versus-intermission">
                <div className="multiplayer-round-head">
                  <div>
                    <p className="versus-kicker">
                      {currentRound
                        ? `Round ${currentRound.index + 1} of ${totalRounds} complete`
                        : 'Round complete'}
                    </p>
                    <h2>
                      {currentRound ? multiplayerModeLabel(currentRound.mode) : 'Scores'}
                    </h2>
                  </div>
                  <MultiplayerTimer
                    endsAt={room.phaseEndsAt}
                    serverNow={state.serverNow}
                    label="Next round"
                    durationMs={MULTIPLAYER_INTERMISSION_MS}
                  />
                </div>
                <MultiplayerRoundReveal
                  answerLabel={revealedAnswer}
                  answer={revealedCatalogAnswer}
                  attempts={attemptsForRound}
                  members={state.members}
                  catalog={catalog}
                />
              </div>
            ) : currentRound?.clue && ownAttempt ? (
              <>
                <div className="multiplayer-round-head">
                  <div className="versus-round-id">
                    <span className="versus-round-icon" aria-hidden="true">
                      <ModeGlyph presentationKey={multiplayerModeGlyphKey(currentRound.mode)} />
                    </span>
                    <div>
                      <p className="versus-kicker">
                        Round {currentRound.index + 1} of {totalRounds}
                      </p>
                      <h2>
                        {multiplayerModeLabel(currentRound.mode)}
                        <span className="versus-round-sub">
                          {' '}
                          · {currentRound.modeRound}/{room.roundsPerMode}
                        </span>
                      </h2>
                    </div>
                  </div>
                  <div className="multiplayer-round-actions">
                    {ownAttempt.status === 'active' && (
                      <MultiplayerSurrenderControl
                        disabled={roomInteractionBlocked}
                        onConfirm={() => void runMutation(() => surrenderMultiplayerRound({
                          roomId: room.id,
                          roundId: currentRound.id,
                          idempotencyKey: createMultiplayerIdempotencyKey(
                            `surrender-${currentRound.id}`,
                          ),
                        }))}
                      />
                    )}
                    <MultiplayerTimer
                      endsAt={currentRound.endsAt ?? room.phaseEndsAt}
                      serverNow={state.serverNow}
                      label="Time left:"
                      durationMs={MULTIPLAYER_ROUND_MS}
                    />
                  </div>
                </div>
                <MultiplayerRoundProgress
                  rounds={state.rounds}
                  currentIndex={room.currentRoundIndex}
                />
                {catalogError ? (
                  <div className="versus-error" role="alert">
                    <p>Could not load the title catalog.</p>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={catalogLoading}
                      onClick={() => void loadCatalog()}
                    >
                      {catalogLoading ? 'Retrying…' : 'Retry catalog'}
                    </button>
                  </div>
                ) : (
                  <MultiplayerRoundBoard
                    round={{
                      id: currentRound.id,
                      mode: currentRound.mode,
                      clue: currentRound.clue,
                    }}
                    guessPool={catalog}
                    guessIds={ownAttempt.guessIds ?? []}
                    feedback={feedback}
                    status={ownAttempt.status === 'timed_out' ? 'timeout' : ownAttempt.status}
                    pending={roomInteractionBlocked}
                    answerLabel={revealedAnswer}
                    showKnownInfo={false}
                    onGuess={(manhwa) => void runMutation(() => submitMultiplayerGuess({
                      roomId: room.id,
                      roundId: currentRound.id,
                      guessId: manhwa.id,
                      idempotencyKey: createMultiplayerIdempotencyKey(
                        `guess-${currentRound.id}-${manhwa.id}`,
                      ),
                    }))}
                  />
                )}
                <div className="versus-round-foot">
                  <p className="versus-hint">
                    {ownAttempt.status === 'active'
                      ? `${ownAttempt.guessCount}/${currentRound.maxGuesses} guesses used`
                      : ownAttempt.status === 'won'
                        ? 'Solved — waiting for the other players.'
                        : 'Round over for you — waiting for the other players.'}
                  </p>
                </div>
              </>
            ) : (
              <p className="versus-muted">Synchronizing round…</p>
            )}
          </section>
          {room.status === 'active' && ownAttempt && (
            <aside className="versus-panel versus-battle-known">
              <div className="versus-known">
                <KnownInfoPanel
                  info={buildKnownInfo(feedback)}
                  hasGuesses={feedback.length > 0}
                />
              </div>
            </aside>
          )}
        </div>
      )}
      <SavedListManagerDialog
        open={listManagerOpen}
        onClose={() => setListManagerOpen(false)}
        catalog={catalog}
        onListsChange={setSavedLists}
      />
    </main>
  )
}
