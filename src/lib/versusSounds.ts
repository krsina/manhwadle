import type { VersusEffectId } from './versusEffects'

export type VersusSoundId = VersusEffectId | 'player-solved' | 'player-failed'

export interface PlayVersusSoundOptions {
  volume?: number
  countdownStep?: 3 | 2 | 1
}

let sharedContext: AudioContext | null = null
let lastCue: VersusSoundId | null = null
let lastPlayedAt = 0

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Constructor) return null
  try {
    if (!sharedContext || sharedContext.state === 'closed') sharedContext = new Constructor()
    return sharedContext
  } catch {
    return null
  }
}

function tone(
  context: AudioContext,
  output: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  gain = 0.16,
  type: OscillatorType = 'sine',
  endFrequency?: number,
): void {
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency != null) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration)
  }
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.018, duration / 3))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(output)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.03)
}

function noise(
  context: AudioContext,
  output: AudioNode,
  start: number,
  duration: number,
  gain = 0.07,
  frequency = 1800,
): void {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < frameCount; index += 1) {
    data[index] = Math.random() * 2 - 1
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const envelope = context.createGain()
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(frequency, start)
  filter.Q.value = 1.2
  envelope.gain.setValueAtTime(gain, start)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(output)
  source.start(start)
}

function chord(
  context: AudioContext,
  output: AudioNode,
  frequencies: readonly number[],
  start: number,
  duration: number,
  gain = 0.1,
): void {
  frequencies.forEach((frequency, index) => {
    tone(context, output, frequency, start + index * 0.025, duration, gain, 'triangle')
  })
}

function scheduleCue(
  context: AudioContext,
  output: AudioNode,
  cue: VersusSoundId,
  options: PlayVersusSoundOptions,
): void {
  const now = context.currentTime + 0.015
  switch (cue) {
    case 'countdown': {
      const step = options.countdownStep ?? 3
      const baseFrequency = step === 3 ? 294 : step === 2 ? 349 : 440
      tone(context, output, baseFrequency, now, 0.11, 0.11, 'square', baseFrequency * 1.16)
      tone(context, output, baseFrequency * 2, now + 0.075, 0.09, 0.045, 'sine')
      break
    }
    case 'round-start':
      noise(context, output, now, 0.16, 0.06, 2400)
      chord(context, output, [330, 494, 659], now + 0.04, 0.28, 0.08)
      break
    case 'correct-guess':
      tone(context, output, 523, now, 0.12, 0.11, 'triangle')
      tone(context, output, 784, now + 0.08, 0.2, 0.1, 'sine')
      break
    case 'incorrect-guess':
      tone(context, output, 180, now, 0.15, 0.1, 'square', 125)
      noise(context, output, now, 0.09, 0.035, 680)
      break
    case 'opponent-solved':
      tone(context, output, 392, now, 0.11, 0.08, 'sine')
      tone(context, output, 587, now + 0.1, 0.16, 0.075, 'triangle')
      break
    case 'player-solved':
      tone(context, output, 440, now, 0.1, 0.075, 'triangle')
      tone(context, output, 659, now + 0.07, 0.12, 0.07, 'triangle')
      tone(context, output, 880, now + 0.15, 0.18, 0.055, 'sine')
      break
    case 'player-failed':
      tone(context, output, 220, now, 0.12, 0.075, 'triangle')
      tone(context, output, 147, now + 0.09, 0.2, 0.07, 'sine', 110)
      noise(context, output, now + 0.04, 0.1, 0.02, 520)
      break
    case 'round-win':
      noise(context, output, now, 0.12, 0.045, 3200)
      chord(context, output, [392, 523, 659], now + 0.02, 0.36, 0.095)
      tone(context, output, 1047, now + 0.18, 0.3, 0.07, 'sine')
      break
    case 'round-loss':
      chord(context, output, [294, 247, 196], now, 0.38, 0.075)
      tone(context, output, 146, now + 0.12, 0.42, 0.07, 'sine', 110)
      break
    case 'timeout':
      tone(context, output, 220, now, 0.12, 0.09, 'square')
      tone(context, output, 196, now + 0.18, 0.12, 0.08, 'square')
      tone(context, output, 130, now + 0.36, 0.36, 0.08, 'sine', 82)
      break
    case 'answer-reveal':
      noise(context, output, now, 0.22, 0.04, 2800)
      tone(context, output, 440, now + 0.03, 0.32, 0.06, 'sine', 880)
      chord(context, output, [523, 659], now + 0.2, 0.28, 0.065)
      break
    case 'score-change':
      ;[440, 554, 659, 880].forEach((frequency, index) => {
        tone(context, output, frequency, now + index * 0.07, 0.18, 0.065, 'triangle')
      })
      break
    case 'match-victory':
      noise(context, output, now, 0.2, 0.05, 3800)
      chord(context, output, [262, 330, 392], now, 0.55, 0.09)
      chord(context, output, [392, 494, 659], now + 0.26, 0.7, 0.09)
      chord(context, output, [523, 659, 784, 1047], now + 0.56, 0.9, 0.075)
      break
    case 'match-defeat':
      chord(context, output, [330, 277, 220], now, 0.7, 0.065)
      tone(context, output, 165, now + 0.3, 0.75, 0.055, 'sine', 110)
      break
    case 'match-draw':
      chord(context, output, [330, 440], now, 0.35, 0.07)
      chord(context, output, [349, 440], now + 0.28, 0.48, 0.065)
      break
  }
}

export function versusSoundSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
  )
}

/** Plays a short synthesized cue. Safe to call during SSR or without Web Audio support. */
export async function playVersusSound(
  cue: VersusSoundId,
  options: PlayVersusSoundOptions = {},
): Promise<void> {
  const playedAt = typeof performance === 'undefined' ? Date.now() : performance.now()
  if (cue === lastCue && playedAt - lastPlayedAt < 90) return
  lastCue = cue
  lastPlayedAt = playedAt

  const context = audioContext()
  if (!context) return
  try {
    if (context.state === 'suspended') await context.resume()
  } catch {
    return
  }

  const master = context.createGain()
  master.gain.value = Math.min(1, Math.max(0, options.volume ?? 0.7))
  master.connect(context.destination)
  scheduleCue(context, master, cue, options)
}
