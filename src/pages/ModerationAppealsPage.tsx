import { Link } from 'react-router-dom'
import { LegalDoc } from './LegalDoc'

export function ModerationAppealsPage() {
  return (
    <LegalDoc title="Moderation & appeals">
      <section>
        <h2>Username moderation</h2>
        <p>
          Public usernames are moderated for format, reserved terms, abuse, and impersonation.
          Moderators may force a rename. Forced replacements bypass the normal change cooldown for
          that one replacement.
        </p>
      </section>
      <section>
        <h2>Restrictions and bans</h2>
        <p>
          Temporary or permanent cloud bans and leaderboard exclusions may be applied with a
          recorded reason. Cloud-banned accounts can still authenticate for read-only access to
          existing synced data and can keep playing locally.
        </p>
      </section>
      <section>
        <h2>Reports</h2>
        <p>
          Signed-in players may report abusive usernames or conduct through in-product flows when
          available. Staff actions are audited server-side.
        </p>
      </section>
      <section>
        <h2>Appeals</h2>
        <p>
          If your account is restricted, use the in-app appeal flow when offered, or contact the
          address listed on this page. Appeals are reviewed by staff; outcomes are not guaranteed.
          See also the <Link to="/privacy">Privacy</Link> and <Link to="/terms">Terms</Link>{' '}
          pages.
        </p>
      </section>
    </LegalDoc>
  )
}
