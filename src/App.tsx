import manhwaData from './data/manhwa.json'
import type { Manhwa } from './lib/anilist-types'
import { resolveActiveMode } from './modes'
import './styles.css'

const pool = manhwaData as Manhwa[]

/**
 * Shell: resolve which guessing variant to run.
 * Default is summary mode; pass another id later (URL, picker, etc.).
 */
function App() {
  const mode = resolveActiveMode()
  const ModeGame = mode.Component

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      <ModeGame pool={pool} />
      <footer className="footer">
        <p>
          Data from{' '}
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            AniList
          </a>
          . Top 250 Korean manhwa by popularity.
        </p>
      </footer>
    </div>
  )
}

export default App
