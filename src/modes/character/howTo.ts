import type { HowToPlayGuide } from '../../lib/howto'

export const characterHowTo: HowToPlayGuide = {
  title: 'How to play',
  intro: 'Guess today’s manhwa from a character still. One puzzle per day.',
  steps: [
    {
      title: 'Study the character',
      body: 'You see a full character portrait. Use the face, outfit, and vibe to narrow the series.',
    },
    {
      title: 'Hard mode (optional)',
      body: 'Hard Mode can show any cast member, including supporting roles, forces black and white, and starts extreme close-up — wrong guesses zoom out, or tap Reveal more without spending a guess. A Color toggle unlocks on your last guess. Hard Mode locks after your first guess.',
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
  footer: 'A new character arrives every day. Come back tomorrow if you miss this one.',
}
