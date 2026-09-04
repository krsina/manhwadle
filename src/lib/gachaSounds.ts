import type { GachaRarity } from './gacha'

export interface GachaSoundOptions {
  volume?: number
  muted?: boolean
}

let sharedContext: AudioContext | null = null
let spinSession = 0
let spinMaster: GainNode | null = null
let lastTickAt = 0

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

export function gachaSoundSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
  )
}

async function withContext(play: (context: AudioContext, output: AudioNode) => void): Promise<void> {
  const context = audioContext()
  if (!context) return
  try {
    if (context.state === 'suspended') await context.resume()
  } catch {
    return
  }
  const output = spinMaster ?? context.destination
  play(context, output)
}

function tone(
  context: AudioContext,
  output: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  gain = 0.12,
  type: OscillatorType = 'sine',
  endFrequency?: number,
  attack = 0.012,
): void {
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency != null) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration)
  }
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(attack, duration / 4))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(output)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.05)
}

function voice(
  context: AudioContext,
  output: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  gain: number,
  endFrequency?: number,
): void {
  tone(context, output, frequency, start, duration, gain, 'triangle', endFrequency, 0.018)
  tone(context, output, frequency, start, duration * 0.92, gain * 0.45, 'sawtooth', endFrequency, 0.022)
  tone(context, output, frequency * 2.003, start, duration * 0.55, gain * 0.22, 'sine', endFrequency ? endFrequency * 2 : undefined, 0.01)
}

function bell(
  context: AudioContext,
  output: AudioNode,
  frequency: number,
  start: number,
  gain: number,
): void {
  tone(context, output, frequency, start, 0.7, gain, 'sine', undefined, 0.008)
  tone(context, output, frequency * 2.76, start, 0.32, gain * 0.22, 'sine', undefined, 0.006)
  tone(context, output, frequency * 5.4, start, 0.16, gain * 0.08, 'sine', undefined, 0.004)
}

function noise(
  context: AudioContext,
  output: AudioNode,
  start: number,
  duration: number,
  gain: number,
  fromHz: number,
  toHz = fromHz,
  type: BiquadFilterType = 'bandpass',
  q = 1.1,
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
  filter.type = type
  filter.frequency.setValueAtTime(fromHz, start)
  if (toHz !== fromHz) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, toHz), start + duration)
  }
  filter.Q.value = q
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, duration / 5))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(output)
  source.start(start)
  source.stop(start + duration + 0.03)
}

function shimmerDelay(
  context: AudioContext,
  output: AudioNode,
  wet = 0.28,
  delayTime = 0.155,
  feedbackAmount = 0.34,
): AudioNode {
  const delay = context.createDelay()
  const feedback = context.createGain()
  const mix = context.createGain()
  delay.delayTime.value = delayTime
  feedback.gain.value = feedbackAmount
  mix.gain.value = wet
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(mix)
  mix.connect(output)
  return delay
}

function attachSpinMaster(context: AudioContext, volume: number): GainNode {
  const now = context.currentTime
  if (spinMaster) {
    try {
      spinMaster.gain.cancelScheduledValues(now)
      spinMaster.gain.setValueAtTime(0.0001, now)
      spinMaster.disconnect()
    } catch {
      /* already gone */
    }
  }
  const master = context.createGain()
  master.gain.value = Math.min(1, Math.max(0, volume))
  master.connect(context.destination)
  spinMaster = master
  return master
}

function playWhoosh(context: AudioContext, output: AudioNode): void {
  const now = context.currentTime + 0.01
  noise(context, output, now, 0.42, 0.045, 420, 2100)
  noise(context, output, now + 0.18, 0.55, 0.03, 1600, 500)
}

function playTick(context: AudioContext, output: AudioNode, progress: number): void {
  const now = context.currentTime
  const frequency = 760 * (1 + progress * 0.14)
  const gain = 0.045 * (0.75 + progress * 0.45)
  tone(context, output, frequency, now, 0.028, gain, 'square')
}

function playCommonUnlock(context: AudioContext, output: AudioNode, now: number): void {
  noise(context, output, now, 0.08, 0.035, 2200, 3200, 'highpass', 0.7)
  tone(context, output, 523.25, now, 0.28, 0.12, 'triangle')
  tone(context, output, 659.25, now + 0.08, 0.38, 0.11, 'sine')
  tone(context, output, 1046.5, now + 0.1, 0.22, 0.04, 'sine')
}

function playRareUnlock(context: AudioContext, output: AudioNode, now: number): void {
  playRareFamilyUnlock(context, output, now, 'rare')
}

function playEpicUnlock(context: AudioContext, output: AudioNode, now: number): void {
  playRareFamilyUnlock(context, output, now, 'epic')
}

function playLegendaryUnlock(context: AudioContext, output: AudioNode, now: number): void {
  playRareFamilyUnlock(context, output, now, 'legendary')
}

function playRareFamilyUnlock(
  context: AudioContext,
  output: AudioNode,
  now: number,
  intensity: 'rare' | 'epic' | 'legendary',
): void {
  const epic = intensity !== 'rare'
  const legendary = intensity === 'legendary'
  const echo = shimmerDelay(
    context,
    output,
    legendary ? 0.46 : epic ? 0.36 : 0.26,
    legendary ? 0.18 : 0.155,
    legendary ? 0.42 : 0.34,
  )
  const hall = legendary ? shimmerDelay(context, output, 0.22, 0.31, 0.28) : echo
  noise(
    context,
    output,
    now,
    legendary ? 0.42 : epic ? 0.34 : 0.28,
    legendary ? 0.085 : epic ? 0.07 : 0.055,
    600,
    legendary ? 5400 : epic ? 4800 : 4200,
    'bandpass',
    0.8,
  )
  noise(
    context,
    echo,
    now + 0.04,
    legendary ? 0.34 : epic ? 0.28 : 0.22,
    legendary ? 0.05 : epic ? 0.04 : 0.03,
    2400,
    legendary ? 7200 : epic ? 5600 : 4800,
    'highpass',
    0.6,
  )

  const lift = [
    { freq: 392.0, at: 0.04, gain: 0.09 },
    { freq: 493.88, at: 0.12, gain: 0.1 },
    { freq: 587.33, at: 0.2, gain: 0.11 },
    { freq: 739.99, at: 0.3, gain: 0.12 },
    { freq: 987.77, at: 0.42, gain: 0.1 },
    ...(epic ? [{ freq: 1174.66, at: 0.54, gain: 0.11 }] : []),
    ...(legendary
      ? [
          { freq: 1567.98, at: 0.68, gain: 0.12 },
          { freq: 1975.53, at: 0.84, gain: 0.1 },
        ]
      : []),
  ]
  const gainBoost = legendary ? 1.22 : epic ? 1.12 : 1
  const voiceLen = legendary ? 0.82 : epic ? 0.68 : 0.55
  for (const note of lift) {
    voice(context, output, note.freq, now + note.at, voiceLen, note.gain * gainBoost)
    bell(context, echo, note.freq * 2, now + note.at + 0.03, note.gain * (legendary ? 0.42 : epic ? 0.36 : 0.28))
    if (epic) {
      voice(context, output, note.freq / 2, now + note.at, legendary ? 0.9 : 0.72, note.gain * (legendary ? 0.46 : 0.38))
      bell(context, echo, note.freq * 3, now + note.at + 0.05, note.gain * (legendary ? 0.16 : 0.12))
    }
    if (legendary) {
      bell(context, hall, note.freq * 4, now + note.at + 0.08, note.gain * 0.08)
    }
  }

  const chordAt = legendary ? 0.68 : epic ? 0.54 : 0.42
  const chordLen = legendary ? 1.7 : epic ? 1.35 : 1.05
  voice(context, output, 392.0, now + chordAt, chordLen, legendary ? 0.08 : epic ? 0.07 : 0.055)
  voice(context, output, 493.88, now + chordAt, chordLen, legendary ? 0.075 : epic ? 0.065 : 0.05)
  voice(context, output, 739.99, now + chordAt, legendary ? 1.85 : epic ? 1.45 : 1.15, legendary ? 0.085 : epic ? 0.075 : 0.06)
  bell(context, echo, 1975.5, now + chordAt + 0.08, legendary ? 0.075 : epic ? 0.06 : 0.045)
  bell(context, echo, 2489.0, now + chordAt + 0.2, legendary ? 0.055 : epic ? 0.045 : 0.03)

  if (!epic) return

  voice(context, output, 196.0, now + chordAt, legendary ? 1.75 : 1.4, legendary ? 0.055 : 0.045)
  voice(context, output, 987.77, now + chordAt, legendary ? 1.8 : 1.45, legendary ? 0.07 : 0.06)
  const left = context.createStereoPanner()
  const right = context.createStereoPanner()
  left.pan.value = legendary ? -0.7 : -0.55
  right.pan.value = legendary ? 0.7 : 0.55
  left.connect(echo)
  right.connect(echo)
  bell(context, left, 2960.0, now + chordAt + 0.28, legendary ? 0.05 : 0.04)
  bell(context, right, 3136.0, now + chordAt + 0.4, legendary ? 0.045 : 0.035)
  noise(context, echo, now + chordAt + 0.12, legendary ? 0.58 : 0.45, legendary ? 0.034 : 0.028, 2800, 6400, 'highpass', 0.5)

  if (!legendary) return

  voice(context, output, 98.0, now + chordAt, 1.85, 0.04)
  voice(context, output, 293.66, now + chordAt, 1.75, 0.05)
  voice(context, output, 783.99, now + chordAt, 1.8, 0.055)
  voice(context, output, 1174.66, now + chordAt + 0.12, 1.65, 0.06)
  voice(context, output, 1567.98, now + chordAt + 0.28, 1.4, 0.055)
  bell(context, hall, 3135.96, now + chordAt + 0.18, 0.055)
  bell(context, left, 3951.07, now + chordAt + 0.46, 0.04)
  bell(context, right, 4186.01, now + chordAt + 0.62, 0.035)
  bell(context, echo, 2349.32, now + chordAt + 0.78, 0.04)
  noise(context, hall, now + chordAt + 0.22, 0.7, 0.022, 3600, 8200, 'highpass', 0.45)
}

function playUnlock(context: AudioContext, output: AudioNode, rarity: GachaRarity): void {
  const now = context.currentTime + 0.012
  if (rarity === 'common') {
    playCommonUnlock(context, output, now)
    return
  }
  if (rarity === 'rare') {
    playRareUnlock(context, output, now)
    return
  }
  if (rarity === 'legendary') {
    playLegendaryUnlock(context, output, now)
    return
  }
  playEpicUnlock(context, output, now)
}

/** How many notes the unlock sting uses — used to keep rarity scaling testable. */
export function gachaUnlockNoteCount(rarity: GachaRarity): number {
  if (rarity === 'legendary') return 16
  if (rarity === 'epic') return 12
  if (rarity === 'rare') return 8
  return 3
}

export function gachaTickMinGapMs(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  const blend = p * p * (3 - 2 * p)
  return 38 + 92 * blend
}

/** Resume the audio context from a user gesture so the first spin can sound. */
export async function warmGachaAudio(): Promise<void> {
  const context = audioContext()
  if (!context) return
  try {
    if (context.state === 'suspended') await context.resume()
  } catch {
    /* ignore */
  }
}

export function stopGachaSpinSound(): void {
  spinSession += 1
  const context = sharedContext
  if (!spinMaster || !context) return
  const now = context.currentTime
  try {
    spinMaster.gain.cancelScheduledValues(now)
    spinMaster.gain.setValueAtTime(Math.max(0.0001, spinMaster.gain.value), now)
    spinMaster.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
  } catch {
    /* ignore */
  }
}

export function beginGachaSpinSound(
  rarity: GachaRarity,
  options: GachaSoundOptions & { skip?: boolean } = {},
): number {
  stopGachaSpinSound()
  const session = spinSession
  if (options.muted) return session

  void withContext((context) => {
    if (session !== spinSession) return
    const master = attachSpinMaster(context, options.volume ?? 0.72)
    if (options.skip) {
      playUnlock(context, master, rarity)
      return
    }
    playWhoosh(context, master)
  })

  return session
}

export function playGachaTickSound(
  progress: number,
  session: number,
  options: GachaSoundOptions = {},
): void {
  if (options.muted || session !== spinSession) return
  const now = typeof performance === 'undefined' ? Date.now() : performance.now()
  if (now - lastTickAt < gachaTickMinGapMs(progress)) return
  lastTickAt = now
  void withContext((context, output) => {
    if (session !== spinSession) return
    playTick(context, output, progress)
  })
}

export function landGachaSpinSound(
  rarity: GachaRarity,
  session: number,
  options: GachaSoundOptions = {},
): void {
  if (options.muted || session !== spinSession) return
  void withContext((context, output) => {
    if (session !== spinSession) return
    playUnlock(context, output, rarity)
  })
}
