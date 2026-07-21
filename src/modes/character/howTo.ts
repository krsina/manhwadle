import type { HowToPlayGuide } from '../../lib/howto'

export const characterHowTo: HowToPlayGuide = {
  title: 'How to play',
  intro: 'Guess today’s manhwa from a zoomed-in character still. One puzzle per day.',
  steps: [
    {
      title: 'Study the crop',
      body: 'You start extreme close-up on a character. Wrong guesses pull the camera back, or tap Reveal more to zoom out without spending a guess.',
    },
    {
      title: 'Hard mode (optional)',
      body: 'Hard Mode can show any cast member, including supporting roles, and forces black and white. A Color toggle unlocks on your last guess. Hard Mode locks after your first guess.',
    },
    {
      title: 'Type a title',
      body: 'Search the catalog and submit a guess. Feedback covers genres, year, status, publisher, and tags.',
    },
    {
      title: 'Read the colors',
      body: '🟩 = correct. 🟨 = close. ⬜ = not it. Year arrows show whether the answer is newer ↑ or older ↓.',
    },
    {
      title: 'Use context clues',
      body: 'The Known panel collects what you’ve confirmed and ruled out across guesses.',
    },
  ],
  footer: 'A new character crop arrives every day. Come back tomorrow if you miss this one.',
}
