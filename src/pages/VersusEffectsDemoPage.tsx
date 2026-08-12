import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '../components/Dialog'
import { KnownInfoPanel } from '../components/KnownInfoPanel'
import {
  MultiplayerRoster,
  type MultiplayerRosterMember,
} from '../components/multiplayer/MultiplayerRoster'
import { MultiplayerRoundBoard } from '../components/multiplayer/MultiplayerRoundBoard'
import { MultiplayerRoundProgress } from '../components/multiplayer/MultiplayerRoundProgress'
import { MultiplayerRoundReveal } from '../components/multiplayer/MultiplayerRoundReveal'
import { MultiplayerSurrenderControl } from '../components/multiplayer/MultiplayerSurrenderControl'
import { MultiplayerTimer } from '../components/multiplayer/MultiplayerTimer'
import { VersusEffectLayer } from '../components/multiplayer/VersusEffectLayer'
import type { GuessFeedback, Manhwa } from '../lib/anilist-types'
import {
  buildRevealLadder,
  indexStoryBlurbs,
  type StoryDescriptionBlurbFile,
} from '../lib/blurbs'
import { loadClientCatalog } from '../lib/clientCatalog'
import { compareGuess } from '../lib/compare'
import { displayTitle } from '../lib/daily'
import { buildKnownInfo } from '../lib/knowledge'
import type { MultiplayerAttemptStatus } from '../lib/multiplayerTypes'
import { HOME_PATH, VERSUS_PATH } from '../lib/routes'
import { listSongs, songsForManhwa } from '../lib/songs'
import {
  getVersusEffect,
  isVersusInlineEffect,
  VERSUS_EFFECTS,
  type VersusEffectId,
} from '../lib/versusEffects'
import { playVersusSound, versusSoundSupported } from '../lib/versusSounds'
import storyBlurbData from '../data/storyDescriptionBlurb.json'

const storyBlurbIndex = indexStoryBlurbs(storyBlurbData as StoryDescriptionBlurbFile)

type PreviewMode = 'both' | 'visual' | 'sound'
type DemoPhase = 'lobby' | 'countdown' | 'active' | 'intermission' | 'completed'

/** Versus rooms use 6 guesses; reveal preview stresses that ceiling. */
const DEMO_MAX_GUESSES = 6

interface MatchFlowStep {
  title: string
  phase: DemoPhase
  cue: VersusEffectId | null
  round: number
  roundLabel: string
  prompt: string
  scores: readonly [number, number, number]
  ownStatus: MultiplayerAttemptStatus | null
  rivalStatus: MultiplayerAttemptStatus | null
  ownGuesses: number
  rivalGuesses: number
  durationMs: number
}

const MATCH_FLOW: readonly MatchFlowStep[] = [
  {
    title: 'Players ready',
    phase: 'lobby',
    cue: null,
    round: 0,
    roundLabel: 'Private room',
    prompt: 'All players are ready. The host starts the match.',
    scores: [0, 0, 0],
    ownStatus: null,
    rivalStatus: null,
    ownGuesses: 0,
    rivalGuesses: 0,
    durationMs: 2200,
  },
  {
    title: 'Match countdown',
    phase: 'countdown',
    cue: 'countdown',
    round: 1,
    roundLabel: 'Summary round',
    prompt: 'First round loading…',
    scores: [0, 0, 0],
    ownStatus: 'active',
    rivalStatus: 'active',
    ownGuesses: 0,
    rivalGuesses: 0,
    durationMs: 2200,
  },
  {
    title: 'Round one begins',
    phase: 'active',
    cue: 'round-start',
    round: 1,
    roundLabel: 'Summary round',
    prompt: 'A reader wakes inside the novel he alone finished.',
    scores: [0, 0, 0],
    ownStatus: 'active',
    rivalStatus: 'active',
    ownGuesses: 0,
    rivalGuesses: 0,
    durationMs: 2200,
  },
  {
    title: 'First guess misses',
    phase: 'active',
    cue: 'incorrect-guess',
    round: 1,
    roundLabel: 'Summary round',
    prompt: 'A reader wakes inside the novel he alone finished.',
    scores: [0, 0, 0],
    ownStatus: 'active',
    rivalStatus: 'active',
    ownGuesses: 1,
    rivalGuesses: 1,
    durationMs: 1900,
  },
  {
    title: 'You solve the round',
    phase: 'active',
    cue: 'correct-guess',
    round: 1,
    roundLabel: 'Summary round',
    prompt: 'Pulse lands on your solved guess row — no center popup.',
    scores: [1250, 0, 0],
    ownStatus: 'won',
    rivalStatus: 'active',
    ownGuesses: 2,
    rivalGuesses: 2,
    durationMs: 2400,
  },
  {
    title: 'Answer reveal',
    phase: 'intermission',
    cue: 'answer-reveal',
    round: 1,
    roundLabel: 'Round one complete',
    prompt: 'Everyone at the 6-guess ceiling for this round.',
    scores: [1250, 0, 0],
    ownStatus: 'won',
    rivalStatus: 'lost',
    ownGuesses: DEMO_MAX_GUESSES,
    rivalGuesses: DEMO_MAX_GUESSES,
    durationMs: 3200,
  },
  {
    title: 'Rival answers first',
    phase: 'active',
    cue: 'opponent-solved',
    round: 2,
    roundLabel: 'Character round',
    prompt: 'Mina’s seat and score flash — still no answer spoilers.',
    scores: [1250, 1200, 0],
    ownStatus: 'active',
    rivalStatus: 'won',
    ownGuesses: 1,
    rivalGuesses: 1,
    durationMs: 2300,
  },
  {
    title: 'Time runs out',
    phase: 'intermission',
    cue: 'timeout',
    round: 2,
    roundLabel: 'Round two complete',
    prompt: 'Reveal every player’s guesses before the next round.',
    scores: [1250, 1200, 0],
    ownStatus: 'timed_out',
    rivalStatus: 'won',
    ownGuesses: DEMO_MAX_GUESSES,
    rivalGuesses: DEMO_MAX_GUESSES,
    durationMs: 3000,
  },
  {
    title: 'You take the lead',
    phase: 'active',
    cue: 'score-change',
    round: 3,
    roundLabel: 'Cover round',
    prompt: 'Your score chip pulses as you climb the standings.',
    scores: [2500, 1200, 900],
    ownStatus: 'won',
    rivalStatus: 'active',
    ownGuesses: 3,
    rivalGuesses: 2,
    durationMs: 2400,
  },
  {
    title: 'Final round secured',
    phase: 'intermission',
    cue: 'answer-reveal',
    round: 4,
    roundLabel: 'Heardle round',
    prompt: 'Post-round reveal before the victory sting.',
    scores: [3650, 2400, 900],
    ownStatus: 'won',
    rivalStatus: 'won',
    ownGuesses: DEMO_MAX_GUESSES,
    rivalGuesses: DEMO_MAX_GUESSES,
    durationMs: 2800,
  },
  {
    title: 'Match victory',
    phase: 'completed',
    cue: 'match-victory',
    round: 4,
    roundLabel: 'Final result',
    prompt: 'You win the match by 1,250 points.',
    scores: [3650, 2400, 900],
    ownStatus: 'won',
    rivalStatus: 'won',
    ownGuesses: 2,
    rivalGuesses: 3,
    durationMs: 3200,
  },
]

const PHASE_LABELS: Record<DemoPhase, string> = {
  lobby: 'Room lobby',
  countdown: 'Get ready',
  active: 'Round active',
  intermission: 'Round complete',
  completed: 'Match complete',
}

const BASE_ROSTER: readonly MultiplayerRosterMember[] = [
  {
    userId: 'demo-you',
    username: 'You',
    avatarId: 'avatar_default_female',
    stageId: 'stage_blossom_courtyard',
    seat: 1,
    ready: true,
    status: 'active',
    totalScore: 2150,
    guessCount: 2,
    attemptStatus: 'active',
    isHost: true,
    isSelf: true,
  },
  {
    userId: 'demo-mina',
    username: 'Mina',
    avatarId: 'avatar_explorer_b',
    stageId: 'stage_sky_meadow',
    seat: 2,
    ready: true,
    status: 'active',
    totalScore: 2480,
    guessCount: 3,
    attemptStatus: 'active',
    isHost: false,
    isSelf: false,
  },
  {
    userId: 'demo-jun',
    username: 'Jun',
    avatarId: 'avatar_explorer_a',
    stageId: 'stage_dusk_plaza',
    seat: 3,
    ready: true,
    status: 'active',
    totalScore: 1740,
    guessCount: 1,
    attemptStatus: 'active',
    isHost: false,
    isSelf: false,
  },
  {
    userId: 'demo-ara',
    username: 'Ara',
    avatarId: 'avatar_default_female',
    stageId: 'stage_sky_meadow',
    seat: 4,
    ready: true,
    status: 'active',
    totalScore: 1520,
    guessCount: 2,
    attemptStatus: 'active',
    isHost: false,
    isSelf: false,
  },
  {
    userId: 'demo-dae',
    username: 'Dae',
    avatarId: 'avatar_explorer_a',
    stageId: 'stage_blossom_courtyard',
    seat: 5,
    ready: true,
    status: 'active',
    totalScore: 1380,
    guessCount: 3,
    attemptStatus: 'active',
    isHost: false,
    isSelf: false,
  },
  {
    userId: 'demo-yuri',
    username: 'Yuri',
    avatarId: 'avatar_explorer_b',
    stageId: 'stage_dusk_plaza',
    seat: 6,
    ready: true,
    status: 'active',
    totalScore: 1210,
    guessCount: 1,
    attemptStatus: 'active',
    isHost: false,
    isSelf: false,
  },
  {
    userId: 'demo-han',
    username: 'Han',
    avatarId: 'avatar_default_female',
    stageId: 'stage_blossom_courtyard',
    seat: 7,
    ready: true,
    status: 'active',
    totalScore: 980,
    guessCount: 2,
    attemptStatus: 'active',
    isHost: false,
    isSelf: false,
  },
  {
    userId: 'demo-sora',
    username: 'Sora',
    avatarId: 'avatar_explorer_a',
    stageId: 'stage_sky_meadow',
    seat: 8,
    ready: true,
    status: 'active',
    totalScore: 760,
    guessCount: 4,
    attemptStatus: 'active',
    isHost: false,
    isSelf: false,
  },
]

function rosterForPreview(
  effect: VersusEffectId,
  flowStep: MatchFlowStep | null,
  playerCount: number,
): MultiplayerRosterMember[] {
  return BASE_ROSTER.slice(0, playerCount).map((member, index) => {
    if (flowStep) {
      const own = member.isSelf
      const rival = member.userId === 'demo-mina'
      return {
        ...member,
        ready: true,
        totalScore:
          flowStep.scores[index] ??
          Math.max(0, (flowStep.round - 1) * 650 - Math.max(0, index - 2) * 120),
        guessCount: own
          ? flowStep.ownGuesses
          : rival
            ? flowStep.rivalGuesses
            : Math.max(0, flowStep.round - 1),
        attemptStatus: own
          ? flowStep.ownStatus
          : rival
            ? flowStep.rivalStatus
            : flowStep.phase === 'lobby'
              ? null
              : index % 3 === 0 && flowStep.phase === 'intermission'
                ? 'lost'
                : 'active',
      }
    }
    if (effect === 'opponent-solved' && member.userId === 'demo-mina') {
      return { ...member, attemptStatus: 'won', guessCount: 4 }
    }
    if (
      (effect === 'correct-guess' || effect === 'round-win' || effect === 'match-victory') &&
      member.isSelf
    ) {
      return { ...member, attemptStatus: 'won', totalScore: 3400 }
    }
    if (effect === 'score-change' && member.isSelf) {
      return { ...member, totalScore: 3730 }
    }
    if (effect === 'match-defeat' && member.userId === 'demo-mina') {
      return { ...member, totalScore: 4100, attemptStatus: 'won' }
    }
    return member
  })
}

interface CatalogDemoRound {
  id: string
  mode: 'summary' | 'character' | 'cover' | 'heardle'
  answer: Manhwa
  clue: Record<string, unknown>
}

function titleMatches(manhwa: Manhwa, wanted: string): boolean {
  const needle = wanted.toLocaleLowerCase()
  return [manhwa.title.english, manhwa.title.romaji, ...manhwa.synonyms].some(
    (title) => title?.toLocaleLowerCase() === needle,
  )
}

function catalogTitle(catalog: Manhwa[], wanted: string, fallbackIndex: number): Manhwa {
  return catalog.find((manhwa) => titleMatches(manhwa, wanted)) ?? catalog[fallbackIndex]!
}

function summaryLadder(answer: Manhwa): string[] {
  return buildRevealLadder(storyBlurbIndex.get(answer.id), answer.description)
}

function buildCatalogRounds(catalog: Manhwa[]): CatalogDemoRound[] {
  const summary = catalogTitle(catalog, 'Omniscient Reader', 1)
  const character = catalogTitle(catalog, 'Solo Leveling', 0)
  const cover = catalogTitle(catalog, 'The Greatest Estate Developer', 2)
  const heardleSong =
    listSongs().find((song) => catalog.some((manhwa) => manhwa.id === song.manhwaId)) ?? null
  const heardle =
    catalog.find((manhwa) => manhwa.id === heardleSong?.manhwaId) ??
    catalog.find((manhwa) => songsForManhwa(manhwa.id).length > 0) ??
    catalog[3]!
  const song = heardleSong?.manhwaId === heardle.id
    ? heardleSong
    : songsForManhwa(heardle.id, { includeBgm: true })[0]
  const lead = character.characters.find(
    (candidate) => candidate.role === 'MAIN' && (candidate.image.large || candidate.image.medium),
  ) ?? character.characters.find((candidate) => candidate.image.large || candidate.image.medium)

  return [
    {
      id: 'demo-summary',
      mode: 'summary',
      answer: summary,
      clue: { blurbs: summaryLadder(summary) },
    },
    {
      id: 'demo-character',
      mode: 'character',
      answer: character,
      clue: {
        image_url: lead?.image.large ?? lead?.image.medium ?? character.coverImage ?? '',
        focus_x: 50,
        focus_y: 28,
      },
    },
    {
      id: 'demo-cover',
      mode: 'cover',
      answer: cover,
      clue: {
        image_url: cover.coverImage ?? '',
        focus_x: 50,
        focus_y: 35,
      },
    },
    {
      id: 'demo-heardle',
      mode: 'heardle',
      answer: heardle,
      clue: {
        id: song?.id ?? 'demo-heardle',
        kind: song?.kind ?? 'vocal',
        source: song?.source ?? 'webtoon_ost',
        youtube_id: song?.youtubeId ?? '',
        start_sec: song?.startSec ?? 0,
      },
    },
  ]
}

function scriptedGuesses(
  roundNumber: number,
  count: number,
  won: boolean,
  answer: Manhwa,
  catalog: Manhwa[],
  salt = 0,
): Manhwa[] {
  const namesByRound: Record<number, string[]> = {
    1: [
      'Tower of God',
      'Solo Leveling',
      'The Greatest Estate Developer',
      'Lookism',
      'Eleceed',
      'Noblesse',
    ],
    2: [
      'Omniscient Reader',
      'The Greatest Estate Developer',
      'Tower of God',
      'Lookism',
      'Eleceed',
      'Noblesse',
    ],
    3: [
      'Solo Leveling',
      'Tower of God',
      'The Greatest Estate Developer',
      'Lookism',
      'Eleceed',
      'Noblesse',
    ],
    4: [
      'Tower of God',
      'Solo Leveling',
      'Lookism',
      'Eleceed',
      'Noblesse',
      'Omniscient Reader',
    ],
  }
  const pool = namesByRound[roundNumber] ?? namesByRound[1]!
  const rotated = [...pool.slice(salt % pool.length), ...pool.slice(0, salt % pool.length)]
  const candidates = rotated
    .map((name, index) => catalogTitle(catalog, name, index + 4 + salt))
    .filter((manhwa) => manhwa.id !== answer.id)
  const unique = [...new Map(candidates.map((manhwa) => [manhwa.id, manhwa])).values()]
  while (unique.length < Math.max(0, count - (won ? 1 : 0))) {
    const filler = catalog.find(
      (manhwa) => manhwa.id !== answer.id && !unique.some((guess) => guess.id === manhwa.id),
    )
    if (!filler) break
    unique.push(filler)
  }
  const needed = Math.max(0, count - (won ? 1 : 0))
  const guesses = unique.slice(0, needed)
  if (won && count > 0) guesses.push(answer)
  while (guesses.length < count) {
    const filler = catalog.find(
      (manhwa) => !guesses.some((guess) => guess.id === manhwa.id),
    )
    if (!filler) break
    guesses.push(filler)
  }
  return guesses.slice(0, count)
}

function scriptedGuessIds(
  roundNumber: number,
  count: number,
  won: boolean,
  answer: Manhwa,
  catalog: Manhwa[],
  salt = 0,
): number[] {
  return scriptedGuesses(roundNumber, count, won, answer, catalog, salt).map(
    (manhwa) => manhwa.id,
  )
}

function revealAttemptsForRoster(
  members: MultiplayerRosterMember[],
  flowStep: MatchFlowStep,
  answer: Manhwa,
  catalog: Manhwa[],
): { userId: string; guessIds: number[] | null }[] {
  return members.map((member, index) => {
    const won =
      member.isSelf
        ? flowStep.ownStatus === 'won'
        : member.userId === 'demo-mina'
          ? flowStep.rivalStatus === 'won'
          : index % 2 === 0
    return {
      userId: member.userId,
      guessIds: scriptedGuessIds(
        flowStep.round,
        DEMO_MAX_GUESSES,
        won,
        answer,
        catalog,
        index + flowStep.round,
      ),
    }
  })
}

const INLINE_PREVIEW_BY_CUE: Partial<
  Record<VersusEffectId, { round: number; ownGuesses: number; won: boolean }>
> = {
  'incorrect-guess': { round: 1, ownGuesses: 1, won: false },
  'correct-guess': { round: 1, ownGuesses: 2, won: true },
  'opponent-solved': { round: 2, ownGuesses: 1, won: false },
  'score-change': { round: 3, ownGuesses: 3, won: true },
  'answer-reveal': { round: 1, ownGuesses: DEMO_MAX_GUESSES, won: true },
}

export function VersusEffectsDemoPage() {
  const [selected, setSelected] = useState<VersusEffectId>('round-win')
  const [previewMode, setPreviewMode] = useState<PreviewMode>('both')
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(70)
  const [run, setRun] = useState(1)
  const [countdownNumber, setCountdownNumber] = useState<3 | 2 | 1>(3)
  const [sequenceRunning, setSequenceRunning] = useState(false)
  const [flowIndex, setFlowIndex] = useState<number | null>(5)
  const [catalog, setCatalog] = useState<Manhwa[]>([])
  const [catalogError, setCatalogError] = useState(false)
  const [manualGuessIds, setManualGuessIds] = useState<number[]>([])
  const [cueCatalogOpen, setCueCatalogOpen] = useState(false)
  const [playerCount, setPlayerCount] = useState(8)
  const [inlinePulse, setInlinePulse] = useState(false)
  const [demoSurrendered, setDemoSurrendered] = useState(false)
  const sequenceTimers = useRef<number[]>([])
  const effect = getVersusEffect(selected)
  const flowStep = flowIndex == null ? null : MATCH_FLOW[flowIndex]!
  const visibleCue = flowStep ? flowStep.cue : selected
  const overlayCue =
    visibleCue &&
    previewMode !== 'sound' &&
    !isVersusInlineEffect(visibleCue) &&
    flowStep?.phase !== 'intermission'
      ? visibleCue
      : null
  const audioSupported = versusSoundSupported()
  const timerDuration = flowStep?.phase === 'countdown' ? 3_000 : 180_000
  const timerEnd = useMemo(
    () => new Date(Date.now() + (flowStep?.phase === 'countdown' ? 3_000 : 43_000)).toISOString(),
    [flowStep?.phase],
  )
  const roster = useMemo(() => {
    const members = rosterForPreview(selected, flowStep, playerCount)
    if (!demoSurrendered) return members
    return members.map((member) =>
      member.isSelf ? { ...member, attemptStatus: 'surrendered' } : member,
    )
  }, [demoSurrendered, flowStep, playerCount, selected])
  const demoRounds = useMemo(
    () => (catalog.length > 0 ? buildCatalogRounds(catalog) : []),
    [catalog],
  )
  const inlinePreview = !flowStep ? INLINE_PREVIEW_BY_CUE[selected] ?? null : null
  const activeRound = useMemo(() => {
    if (flowStep && flowStep.round > 0) return demoRounds[flowStep.round - 1] ?? null
    if (inlinePreview) return demoRounds[inlinePreview.round - 1] ?? null
    return null
  }, [demoRounds, flowStep, inlinePreview])
  const scriptedGuessList = useMemo(() => {
    if (!activeRound || catalog.length === 0) return []
    if (flowStep) {
      return scriptedGuesses(
        flowStep.round,
        flowStep.ownGuesses,
        flowStep.ownStatus === 'won',
        activeRound.answer,
        catalog,
      )
    }
    if (inlinePreview) {
      return scriptedGuesses(
        inlinePreview.round,
        inlinePreview.ownGuesses,
        inlinePreview.won,
        activeRound.answer,
        catalog,
      )
    }
    return []
  }, [activeRound, catalog, flowStep, inlinePreview])
  const displayedGuesses = useMemo(() => {
    const combined = [
      ...scriptedGuessList,
      ...manualGuessIds
        .map((id) => catalog.find((manhwa) => manhwa.id === id))
        .filter((manhwa): manhwa is Manhwa => Boolean(manhwa)),
    ]
    return [...new Map(combined.map((manhwa) => [manhwa.id, manhwa])).values()]
  }, [catalog, manualGuessIds, scriptedGuessList])
  const feedback = useMemo<GuessFeedback[]>(
    () => (activeRound ? displayedGuesses.map((guess) => compareGuess(guess, activeRound.answer)) : []),
    [activeRound, displayedGuesses],
  )
  const revealAttempts = useMemo(() => {
    if (!activeRound || !flowStep || flowStep.phase !== 'intermission') return []
    return revealAttemptsForRoster(roster, flowStep, activeRound.answer, catalog)
  }, [activeRound, catalog, flowStep, roster])
  const progressRounds = (['summary', 'character', 'cover', 'heardle'] as const).map(
    (mode, index) => ({
      index,
      mode,
      modeRound: 1,
      status:
        flowStep && flowStep.round > index + 1
          ? ('completed' as const)
          : flowStep?.round === index + 1
            ? flowStep.phase === 'countdown'
              ? ('countdown' as const)
              : ('active' as const)
            : ('pending' as const),
    }),
  )
  const boardStatus =
    demoSurrendered
      ? ('surrendered' as const)
      : flowStep?.ownStatus === 'timed_out'
      ? ('timeout' as const)
      : flowStep?.ownStatus ?? (inlinePreview?.won ? ('won' as const) : ('active' as const))
  const showIntermissionReveal = Boolean(
    flowStep?.phase === 'intermission' && activeRound && catalog.length > 0,
  )
  const showPlayingBoard = Boolean(
    activeRound &&
      catalog.length > 0 &&
      (flowStep?.phase === 'active' || (!flowStep && inlinePreview && selected !== 'answer-reveal')),
  )
  const showInlineAnswerReveal = Boolean(
    !flowStep && selected === 'answer-reveal' && activeRound && catalog.length > 0,
  )
  const inlineCueClass =
    visibleCue && isVersusInlineEffect(visibleCue) && inlinePulse
      ? ` is-inline-${visibleCue}`
      : ''
  const standingsCueClass =
    visibleCue === 'opponent-solved' && inlinePulse
      ? ' is-inline-opponent-solved'
      : visibleCue === 'score-change' && inlinePulse
        ? ' is-inline-score-change'
        : ''

  useEffect(() => {
    let active = true
    void loadClientCatalog()
      .then((loaded) => {
        if (active) setCatalog(loaded)
      })
      .catch(() => {
        if (active) setCatalogError(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setManualGuessIds([])
    setDemoSurrendered(false)
  }, [flowIndex])

  useEffect(() => {
    if (flowStep?.phase !== 'countdown') return
    setCountdownNumber(3)
    const second = window.setTimeout(() => setCountdownNumber(2), 700)
    const first = window.setTimeout(() => setCountdownNumber(1), 1_400)
    return () => {
      window.clearTimeout(second)
      window.clearTimeout(first)
    }
  }, [flowStep?.phase])

  useEffect(() => {
    if (flowStep?.phase !== 'countdown' || previewMode === 'visual' || muted) return
    void playVersusSound('countdown', {
      volume: volume / 100,
      countdownStep: countdownNumber,
    })
  }, [countdownNumber, flowStep?.phase, muted, previewMode, volume])

  const clearSequence = useCallback(() => {
    sequenceTimers.current.forEach((timer) => window.clearTimeout(timer))
    sequenceTimers.current = []
    setSequenceRunning(false)
  }, [])

  useEffect(() => clearSequence, [clearSequence])

  const triggerCue = useCallback(
    (cue: VersusEffectId) => {
      setSelected(cue)
      setRun((value) => value + 1)
      if (isVersusInlineEffect(cue)) {
        setInlinePulse(false)
        window.requestAnimationFrame(() => {
          setInlinePulse(true)
        })
      } else {
        setInlinePulse(false)
      }
      if (previewMode !== 'visual' && !muted) {
        void playVersusSound(cue, { volume: volume / 100 })
      }
    },
    [muted, previewMode, volume],
  )

  useEffect(() => {
    if (!inlinePulse) return
    const timer = window.setTimeout(() => setInlinePulse(false), 1_100)
    return () => window.clearTimeout(timer)
  }, [inlinePulse, run])

  const playCue = useCallback(
    (cue: VersusEffectId) => {
      clearSequence()
      setFlowIndex(null)
      triggerCue(cue)
    },
    [clearSequence, triggerCue],
  )

  const runMatchFlow = () => {
    clearSequence()
    setSequenceRunning(true)
    let elapsed = 0
    MATCH_FLOW.forEach((step, index) => {
      const timer = window.setTimeout(() => {
        setFlowIndex(index)
        if (step.cue) triggerCue(step.cue)
      }, elapsed)
      sequenceTimers.current.push(timer)
      elapsed += step.durationMs
    })
    sequenceTimers.current.push(
      window.setTimeout(() => setSequenceRunning(false), elapsed),
    )
  }

  const showFlowStep = (index: number) => {
    clearSequence()
    const bounded = Math.min(MATCH_FLOW.length - 1, Math.max(0, index))
    const step = MATCH_FLOW[bounded]!
    setFlowIndex(bounded)
    if (step.cue) triggerCue(step.cue)
  }

  return (
    <main className="versus-effects-demo">
      <header className="versus-effects-head">
        <div>
          <p className="modal-kicker">Dev preview · Versus</p>
          <h1>Battle feedback lab</h1>
          <p>
            Guess and rival feedback stays on the board and standings. Intermission shows what
            everyone guessed. Overlay stings are only for countdown, round open/close, and match
            end.
          </p>
        </div>
        <nav aria-label="Demo page links">
          <Link to={VERSUS_PATH}>Open Versus</Link>
          <span aria-hidden="true">·</span>
          <Link to={HOME_PATH}>Home</Link>
        </nav>
      </header>

      <section className="versus-effects-toolbar" aria-label="Preview controls">
        <div className="versus-effects-mode" role="group" aria-label="Playback mode">
          {(
            [
              ['both', 'Visual + sound'],
              ['visual', 'Visual only'],
              ['sound', 'Sound only'],
            ] as const
          ).map(([mode, label]) => (
            <button
              type="button"
              className={`btn btn-ghost${previewMode === mode ? ' is-active' : ''}`}
              key={mode}
              onClick={() => setPreviewMode(mode)}
              aria-pressed={previewMode === mode}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" onClick={() => playCue(selected)}>
          Replay effect
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={sequenceRunning ? clearSequence : runMatchFlow}
        >
          {sequenceRunning
            ? 'Pause match flow'
            : flowIndex === 0
              ? 'Play full match'
              : flowIndex == null
                ? 'Run full match'
                : 'Restart match'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setMuted((value) => !value)}
          aria-pressed={muted}
          disabled={!audioSupported}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setCueCatalogOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={cueCatalogOpen}
        >
          Cue catalog
        </button>
        <label className="versus-effects-player-count">
          <span>Players</span>
          <select
            value={playerCount}
            onChange={(event) => setPlayerCount(Number(event.target.value))}
          >
            {[3, 4, 6, 8].map((count) => (
              <option value={count} key={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <label className="versus-effects-volume">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            disabled={!audioSupported}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <output>{volume}%</output>
        </label>
      </section>

      {flowStep && (
        <section className="versus-effects-flow" aria-label="Mock match flow">
          <div className="versus-effects-flow-copy" aria-live="polite">
            <small>
              Scene {flowIndex! + 1} of {MATCH_FLOW.length}
            </small>
            <strong>{flowStep.title}</strong>
            <span>{flowStep.prompt}</span>
          </div>
          <div
            className="versus-effects-flow-track"
            role="progressbar"
            aria-label="Mock match progress"
            aria-valuemin={1}
            aria-valuemax={MATCH_FLOW.length}
            aria-valuenow={flowIndex! + 1}
          >
            <span style={{ width: `${((flowIndex! + 1) / MATCH_FLOW.length) * 100}%` }} />
          </div>
          <div className="versus-effects-flow-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => showFlowStep(flowIndex! - 1)}
              disabled={flowIndex === 0}
            >
              Previous scene
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => showFlowStep(flowIndex! + 1)}
              disabled={flowIndex === MATCH_FLOW.length - 1}
            >
              Next scene
            </button>
          </div>
        </section>
      )}

      {!audioSupported && (
        <p className="versus-effects-audio-note" role="status">
          Web Audio is unavailable in this browser; visual previews still work.
        </p>
      )}

      <div className="versus-effects-workspace">
        <section className="versus-effects-arena" aria-labelledby="versus-effects-preview-title">
          <div className="versus-effects-arena-head">
            <div>
              <p className="versus-kicker">{flowStep ? 'Mock match' : 'Live preview'}</p>
              <div className="versus-effects-arena-title">
                <h2 id="versus-effects-preview-title">{flowStep?.title ?? effect.label}</h2>
                <span>
                  {flowStep?.phase === 'lobby'
                    ? `Room M4NH · ${playerCount} players`
                    : flowStep?.phase === 'completed'
                      ? 'Final standings'
                      : flowStep
                        ? `Round ${flowStep.round} of 4 · Live standings`
                        : 'Effect preview'}
                </span>
              </div>
            </div>
            <span className={`versus-phase is-${flowStep?.phase ?? 'active'}`}>
              {PHASE_LABELS[flowStep?.phase ?? 'active']}
            </span>
          </div>

          <div
            className={`versus-effects-match${
              activeRound &&
              (flowStep?.phase === 'active' ||
                (!flowStep && inlinePreview && selected !== 'answer-reveal'))
                ? ' has-known'
                : ''
            }`}
          >
            <aside
              className={`versus-effects-standings is-count-${playerCount}${
                playerCount > 4 ? ' is-crowded' : ''
              }${standingsCueClass}`}
            >
              <MultiplayerRoster
                members={roster}
                maxPlayers={playerCount}
                showScores={flowStep?.phase !== 'lobby'}
              />
            </aside>
            <div className="versus-effects-board">
              <div className="versus-effects-round-head">
                <span className="versus-effects-round-number">
                  {flowStep
                    ? flowStep.round === 0
                      ? '—'
                      : String(flowStep.round).padStart(2, '0')
                    : inlinePreview
                      ? String(inlinePreview.round).padStart(2, '0')
                      : '02'}
                </span>
                <div className="versus-effects-round-copy">
                  <small>{flowStep?.roundLabel ?? 'Character round'}</small>
                  <strong>
                    {flowStep?.phase === 'lobby'
                      ? 'Room M4NH'
                      : flowStep?.phase === 'completed'
                        ? 'Final standings'
                        : flowStep?.phase === 'intermission'
                          ? 'Round complete'
                          : activeRound
                            ? `${activeRound.mode[0]!.toUpperCase()}${activeRound.mode.slice(1)} mode`
                            : flowStep?.prompt ?? 'Who is this protagonist?'}
                  </strong>
                </div>
                <div className="multiplayer-round-actions">
                  {showPlayingBoard && boardStatus === 'active' && (
                    <MultiplayerSurrenderControl
                      onConfirm={() => {
                        setDemoSurrendered(true)
                        if (previewMode !== 'visual' && !muted) {
                          void playVersusSound('player-failed', { volume: volume / 100 })
                        }
                      }}
                    />
                  )}
                  {flowStep?.phase !== 'lobby' && flowStep?.phase !== 'completed' && (
                    <MultiplayerTimer
                      endsAt={timerEnd}
                      label={
                        flowStep?.phase === 'countdown'
                          ? 'Starts in'
                          : flowStep?.phase === 'intermission'
                            ? 'Next round'
                            : 'Time left:'
                      }
                      durationMs={timerDuration}
                      variant="inline"
                    />
                  )}
                </div>
              </div>
              {flowStep && flowStep.round > 0 && (
                <MultiplayerRoundProgress
                  rounds={progressRounds}
                  currentIndex={flowStep.round - 1}
                />
              )}
              <div className={`versus-effects-play${inlineCueClass}`}>
                {showIntermissionReveal || showInlineAnswerReveal ? (
                  <div className="versus-effects-reveal">
                    <MultiplayerRoundReveal
                      answerLabel={displayTitle(activeRound!.answer)}
                      answer={activeRound!.answer}
                      attempts={
                        showIntermissionReveal
                          ? revealAttempts
                          : revealAttemptsForRoster(
                              roster,
                              {
                                title: 'Answer reveal',
                                phase: 'intermission',
                                cue: 'answer-reveal',
                                round: inlinePreview?.round ?? 1,
                                roundLabel: 'Round complete',
                                prompt: '',
                                scores: [1250, 0, 0],
                                ownStatus: 'won',
                                rivalStatus: 'lost',
                                ownGuesses: DEMO_MAX_GUESSES,
                                rivalGuesses: DEMO_MAX_GUESSES,
                                durationMs: 0,
                              },
                              activeRound!.answer,
                              catalog,
                            )
                      }
                      members={roster}
                      catalog={catalog}
                    />
                  </div>
                ) : showPlayingBoard ? (
                  <MultiplayerRoundBoard
                    round={{
                      id: activeRound!.id,
                      mode: activeRound!.mode,
                      clue: activeRound!.clue,
                    }}
                    guessPool={catalog}
                    guessIds={displayedGuesses.map((guess) => guess.id)}
                    feedback={feedback}
                    status={boardStatus}
                    pending={false}
                    answerLabel={null}
                    showKnownInfo={false}
                    onGuess={(manhwa) => {
                      setManualGuessIds((current) =>
                        current.includes(manhwa.id) ? current : [...current, manhwa.id],
                      )
                    }}
                  />
                ) : (
                  <div
                    className={`versus-effects-clue${
                      flowStep ? ` is-${flowStep.phase}` : ''
                    }`}
                  >
                    <span aria-hidden="true">
                      {flowStep?.phase === 'lobby'
                        ? 'VS'
                        : flowStep?.phase === 'completed'
                          ? '1'
                          : '?'}
                    </span>
                    <strong>
                      {catalogError
                        ? 'Catalog unavailable'
                        : catalog.length === 0
                          ? 'Loading real titles…'
                          : flowStep?.phase === 'lobby'
                            ? 'All players ready'
                            : flowStep?.phase === 'completed'
                              ? 'You win'
                              : 'Round loading'}
                    </strong>
                    <p>{flowStep?.prompt ?? 'Run the full match to preview real game rounds.'}</p>
                  </div>
                )}
                {overlayCue && (
                  <VersusEffectLayer
                    key={`${overlayCue}-${run}-${
                      overlayCue === 'countdown' ? countdownNumber : 'cue'
                    }`}
                    effect={overlayCue}
                    message={overlayCue === 'countdown' ? String(countdownNumber) : undefined}
                  />
                )}
              </div>
            </div>
            {activeRound &&
              (flowStep?.phase === 'active' ||
                (!flowStep && inlinePreview && selected !== 'answer-reveal')) && (
                <aside className="versus-effects-known-panel">
                  <KnownInfoPanel
                    info={buildKnownInfo(feedback)}
                    hasGuesses={feedback.length > 0}
                  />
                </aside>
              )}
          </div>

          <div className="versus-effects-caption" aria-live="polite">
            <span
              className={`versus-effects-tone is-${
                visibleCue ? getVersusEffect(visibleCue).tone : 'blue'
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>{flowStep?.title ?? effect.message}</strong>
              <p>{flowStep?.prompt ?? effect.description}</p>
            </div>
          </div>
        </section>
      </div>
      <Dialog
        open={cueCatalogOpen}
        onClose={() => setCueCatalogOpen(false)}
        titleId="versus-cue-catalog-title"
        descriptionId="versus-cue-catalog-description"
        panelClassName="versus-effects-catalog-modal"
        backdropClassName="versus-effects-catalog-backdrop"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <button
          type="button"
          className="modal-close"
          onClick={() => setCueCatalogOpen(false)}
          aria-label="Close cue catalog"
        >
          <span aria-hidden="true">×</span>
        </button>
        <p className="modal-kicker">Versus preview</p>
        <h2 id="versus-cue-catalog-title" className="modal-title">
          Cue catalog
        </h2>
        <p id="versus-cue-catalog-description" className="settings-muted">
          Choose an individual moment to preview. This window only closes with the × button.
        </p>
        <div className="versus-effects-cue-list">
          {VERSUS_EFFECTS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`versus-effects-cue is-${item.tone}${
                selected === item.id ? ' is-active' : ''
              }`}
              onClick={() => playCue(item.id)}
              aria-pressed={selected === item.id}
            >
              <span />
              <span>
                <strong>{item.label}</strong>
                <small>{item.eyebrow}</small>
              </span>
              <b aria-hidden="true">▶</b>
            </button>
          ))}
        </div>
      </Dialog>
    </main>
  )
}
