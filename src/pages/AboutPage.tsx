import { Link } from 'react-router-dom'
import { LegalDoc } from './LegalDoc'
import { HOW_IT_WORKS_PATH, PLAY_PATH_PREFIX, UPDATES_PATH } from '../lib/routes'
import { APP_NAME } from '../brand'

export function AboutPage() {
  return (
    <LegalDoc title="About">
      <section>
        <h2>What is {APP_NAME}?</h2>
        <p>
          {APP_NAME} is a daily manhwa guessing game in the spirit of Wordle-style puzzles. Each
          UTC day brings shared challenges across Summary, Character, Cover, and Heardle modes.
          Everyone gets the same puzzles; progress resets at UTC midnight.
        </p>
      </section>
      <section>
        <h2>Why it exists</h2>
        <p>
          {APP_NAME} is built for readers who love Korean comics and webtoons. The goal is a fair,
          replayable daily ritual: short sessions, clear feedback, optional hard mode, and cloud
          sync when you sign in.
        </p>
      </section>
      <section>
        <h2>Accounts, shop, and ads</h2>
        <p>
          You can play anonymously with progress in this browser. Signing in unlocks synced
          progress, Leaderboard, milestones, and the avatar shop (virtual points only). The site
          may show display ads to help cover hosting. Optional rewarded video can grant shop
          points once per day when you choose to watch while signed in.
        </p>
      </section>
      <section>
        <h2>Affiliation</h2>
        <p>
          {APP_NAME} is not affiliated with AniList, YouTube, publishers, or manhwa rights holders.
          Title metadata and many images come from AniList&apos;s API; rights remain with the
          original creators. See Attribution for details.
        </p>
      </section>
      <section>
        <h2>Learn more</h2>
        <p>
          Read <Link to={HOW_IT_WORKS_PATH}>How it works</Link>, browse{' '}
          <Link to={UPDATES_PATH}>Updates</Link>, then jump into{' '}
          <Link to={`${PLAY_PATH_PREFIX}/summary`}>today&apos;s Summary mode</Link>.
        </p>
      </section>
    </LegalDoc>
  )
}
