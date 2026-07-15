import type { HowToPlayGuide } from '../../lib/howto'

/** How-to copy for summary mode — swap this file when the rules change. */
export const summaryHowTo: HowToPlayGuide = {
  title: 'How to play',
  intro: 'Guess today’s manhwa in 6 tries. One puzzle per day.',
  steps: [
    {
      title: 'Read the summary',
      body: 'You start with a short blurb. Each wrong guess unlocks more of the summary.',
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
