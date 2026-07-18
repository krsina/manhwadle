import type { HowToPlayGuide } from '../../lib/howto'

/** How-to copy for summary mode — swap this file when the rules change. */
export const summaryHowTo: HowToPlayGuide = {
  title: 'How to play',
  intro: 'Guess today’s manhwa in 6 tries. One puzzle per day.',
  steps: [
    {
      title: 'Read the summary',
      body: 'You start with a short blurb. Wrong guesses unlock more of the summary, or tap Reveal more to extend the hint without spending a guess.',
    },
    {
      title: 'Hard mode (optional)',
      body: 'Turn on Hard Mode for the opening blurb only. Nothing else unlocks. It locks after your first guess.',
    },
    {
      title: 'Type a title',
      body: 'Search the list and submit a guess. Feedback appears for genres, year, status, publisher, and tags.',
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
  footer: 'A new puzzle arrives every day. Come back tomorrow if you miss this one.',
}
