import { LegalDoc } from './LegalDoc'

export function TermsPage() {
  return (
    <LegalDoc title="Terms">
      <section>
        <h2>Affiliation</h2>
        <p>
          Manhwadle is not affiliated with, endorsed by, or sponsored by AniList, YouTube,
          publishers, or any manhwa rights holders. The site may show third-party display
          advertisements to help cover hosting and development costs. In-game points and the
          avatar shop are virtual only and are not real-money purchases.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not abuse accounts, automate ranked play, harass others, evade bans with alternate
          identities, or attempt to disrupt the service. We may restrict accounts that break these
          rules.
        </p>
      </section>
      <section>
        <h2>Usernames</h2>
        <p>
          Usernames must follow the published format rules. Reserved, offensive, or impersonating
          names may be rejected or force-changed by moderators.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          The game is provided as-is. Features, puzzles, and availability may change or go offline
          without notice.
        </p>
      </section>
      <section>
        <h2>Local play</h2>
        <p>
          Anonymous local play remains available even when cloud features are restricted. Cloud
          bans limit sync and public participation, not offline guessing on your device.
        </p>
      </section>
    </LegalDoc>
  )
}
