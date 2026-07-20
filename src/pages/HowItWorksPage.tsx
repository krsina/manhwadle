import { Link } from 'react-router-dom'
import { LegalDoc } from './LegalDoc'
import { ABOUT_PATH, HOME_PATH, SHOP_PATH } from '../lib/routes'
import { APP_NAME } from '../brand'

export function HowItWorksPage() {
  return (
    <LegalDoc title="How it works">
      <section>
        <h2>Daily modes</h2>
        <p>
          Four modes share the same UTC day. Summary uses written clues. Character and Cover
          reveal visual hints as you guess. Heardle plays a short theme clip via YouTube embeds.
          You get a limited number of guesses; hard mode and hints change the difficulty, not the
          answer set for that day.
        </p>
      </section>
      <section>
        <h2>Reading preference</h2>
        <p>
          Choose Action, Romance, or Both in Preferences. That switches which puzzle track you
          play for the day so the catalog matches what you like to read.
        </p>
      </section>
      <section>
        <h2>Points and avatars</h2>
        <p>
          Finishing verified daily modes and milestones can earn virtual shop points. Spend them
          in the <Link to={SHOP_PATH}>shop</Link> on character avatars and stage backgrounds. Points
          are not real money and cannot be purchased with cash.
        </p>
      </section>
      <section>
        <h2>Ads</h2>
        <p>
          When enabled, {APP_NAME} may show vertical banner rails on wide screens and a bottom
          banner on all sizes, including during play (outside the guess board). You can optionally
          watch one rewarded ad per day for points when signed in.
        </p>
      </section>
      <section>
        <h2>Fair play</h2>
        <p>
          Ranked / cloud features expect human play. Automation, abuse, and ban evasion can lead
          to restricted accounts. Local anonymous play still works offline on your device.
        </p>
      </section>
      <section>
        <h2>Start playing</h2>
        <p>
          Head to the <Link to={HOME_PATH}>home page</Link> for today&apos;s modes, or read{' '}
          <Link to={ABOUT_PATH}>About</Link> for project context.
        </p>
      </section>
    </LegalDoc>
  )
}
