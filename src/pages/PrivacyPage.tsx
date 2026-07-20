import { LegalDoc } from './LegalDoc'

export function PrivacyPage() {
  return (
    <LegalDoc title="Privacy">
      <section>
        <h2>Overview</h2>
        <p>
          Manhwadle is an unofficial fan project. You can play anonymously with progress stored
          in this browser. Optional account features use Supabase Auth.
        </p>
      </section>
      <section>
        <h2>Local storage</h2>
        <p>
          We store game progress, reading preference, and theme in <code>localStorage</code> on
          your device so daily play works offline and without an account.
        </p>
      </section>
      <section>
        <h2>Accounts (Supabase)</h2>
        <p>
          If you sign in (magic link or OAuth), Supabase stores authentication data and synced
          progress associated with your account — including completions, streaks, achievements,
          shop balance, and avatar loadout. Public profiles expose the username you choose and
          Leaderboard progress while signed in.
        </p>
      </section>
      <section>
        <h2>Analytics</h2>
        <p>
          Manhwadle does not use product-analytics trackers. We do not collect
          optional play-behavior events for marketing or product analytics. Operational game data
          for signed-in accounts (described above) is stored only to run the product.
        </p>
      </section>
      <section>
        <h2>Advertising</h2>
        <p>
          When ads are enabled, we may show third-party display banners (Google AdSense and/or
          Adsterra) and an optional user-initiated rewarded video for in-game points. Ad scripts
          and creatives can set cookies or similar identifiers and collect device or usage data
          under the ad partner&apos;s policies. We do not use pop-under or push-notification ad
          formats.
        </p>
      </section>
      <section>
        <h2>Third-party media</h2>
        <p>
          Cover and character images are loaded from AniList CDN and related hosts. Heardle clips
          use the YouTube embed API. Those providers process requests under their own policies.
        </p>
      </section>
      <section>
        <h2>Retention, export, and deletion</h2>
        <p>
          You can export or delete account data from Settings when signed in. Local-only play can
          be cleared by clearing site data in your browser.
        </p>
      </section>
      <section>
        <h2>Error monitoring</h2>
        <p>
          Optional privacy-safe error reporting (for example Sentry) runs only when explicitly
          configured. It does not enable session replay and avoids collecting gameplay content or
          personal identifiers.
        </p>
      </section>
    </LegalDoc>
  )
}
