import type { HowToPlayGuide } from '../../lib/howto'

export const coverHowTo: HowToPlayGuide = {
  title: 'How to play',
  intro: 'Guess today’s manhwa from a zoomed-in cover. One puzzle per day.',
  steps: [
    {
      title: 'Study the cover',
      body: 'You start extreme close-up on the cover art. Wrong guesses pull the camera back, or tap Reveal more to zoom out without spending a guess.',
    },
    {
      title: 'Hard mode (optional)',
      body: 'Hard Mode keeps the zoom ladder and adds heavy pixelation in black & white. Wrong guesses zoom out and clear the pixels, or tap Reveal more without spending a guess. It locks after your first guess.',
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
  footer: 'A new cover crop arrives every day. Come back tomorrow if you miss this one.',
}
