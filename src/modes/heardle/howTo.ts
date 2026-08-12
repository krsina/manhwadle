import type { HowToPlayGuide } from '../../lib/howto'

export const heardleHowTo: HowToPlayGuide = {
  title: 'How to play',
  intro: 'Guess today’s manhwa from a short song clip. One puzzle per day.',
  steps: [
    {
      title: 'Hit play',
      body: 'You get a short clip from a webtoon OST, anime theme, or drama OST. Wrong guesses unlock a longer listen, or tap Reveal more without spending a guess. The music video unlocks on the last hint. Using hints gives up a first-try solve.',
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
      title: 'Hard mode',
      body: 'Hard mode stays strictly audio — no music video — and can serve instrumental BGM as well as vocal themes. Same daily title, tougher clip. It locks after your first guess.',
    },
  ],
  footer: 'A new clip arrives every day. Prefer official uploads; some videos may be region-blocked.',
}
