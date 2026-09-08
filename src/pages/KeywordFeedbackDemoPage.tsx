import { FeedbackGrid } from '../components/FeedbackGrid'
import type { Manhwa } from '../lib/anilist-types'
import { compareGuess } from '../lib/compare'

const ANSWER = makeTitle(1, 'Regression Warrior Mage', [
  'The Mage Warrior Regression',
])

const SCENARIOS: readonly {
  title: string
  description: string
  guess: Manhwa
  displayLabel?: string
}[] = [
  {
    title: 'Single keyword',
    description: 'One answer word appears in the middle of the guess.',
    guess: makeTitle(2, 'The Max-Level Mage Returns'),
  },
  {
    title: 'Different keyword',
    description: 'The same feedback works for another meaningful title word.',
    guess: makeTitle(3, 'Return of the Frozen Warrior'),
  },
  {
    title: 'Keyword at the end',
    description: 'Position in the title does not affect matching.',
    guess: makeTitle(4, 'Reincarnation and Regression'),
  },
  {
    title: 'Multiple keywords',
    description: 'Every matching word receives its own highlight.',
    guess: makeTitle(5, 'Regression Warrior Online'),
  },
  {
    title: 'Case and punctuation',
    description: 'Matching is case-insensitive and punctuation stays intact.',
    guess: makeTitle(6, 'MAGE: Regression Protocol'),
  },
  {
    title: 'Selected alias',
    description: 'The exact alias selected from search is checked and displayed.',
    guess: makeTitle(7, 'Arcane Return', ['Warrior Regression Chronicle']),
    displayLabel: 'Warrior Regression Chronicle',
  },
  {
    title: 'One-to-one repeats',
    description: 'A second copy of a word stays plain when the answer only has one.',
    guess: makeTitle(8, 'The Return of the Mage'),
  },
  {
    title: 'No keyword match',
    description: 'Unrelated titles remain unchanged.',
    guess: makeTitle(9, 'Solo Leveling'),
  },
  {
    title: 'Correct title',
    description: 'An exact solve highlights every title word.',
    guess: ANSWER,
  },
]

function makeTitle(id: number, english: string, synonyms: string[] = []): Manhwa {
  return {
    id,
    title: { english, romaji: null, native: null },
    synonyms,
    description: '',
    genres: ['Action', 'Fantasy'],
    tags: ['Magic'],
    status: 'Ongoing',
    publisher: 'WEBTOON',
    startDate: { year: 2024, month: null, day: null },
    coverImage: null,
    siteUrl: '',
    characters: [],
  }
}

export function KeywordFeedbackDemoPage() {
  return (
    <main className="keyword-feedback-demo">
      <header className="keyword-feedback-demo-hero">
        <p className="eyebrow">Guess feedback demo</p>
        <h1>Matching title keywords</h1>
        <p>
          Demo answer: <strong>{ANSWER.title.english}</strong>. Green marks show which words
          from each guessed title also occur in a known answer title.
        </p>
      </header>

      <div className="keyword-feedback-demo-list">
        {SCENARIOS.map((scenario) => {
          const row = compareGuess(scenario.guess, ANSWER, scenario.displayLabel)
          return (
            <article className="keyword-feedback-demo-scenario" key={scenario.title}>
              <div className="keyword-feedback-demo-copy">
                <h2>{scenario.title}</h2>
                <p>{scenario.description}</p>
              </div>
              <FeedbackGrid rows={[row]} />
            </article>
          )
        })}
      </div>
    </main>
  )
}
