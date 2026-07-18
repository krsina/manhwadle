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
          We store game progress, reading preference, theme, and consent choices in{' '}
          <code>localStorage</code> on your device so daily play works offline and without an
          account.
        </p>
      </section>
      <section>
        <h2>Accounts (Supabase)</h2>
        <p>
          If you sign in (magic link or OAuth), Supabase stores authentication data and synced
          progress associated with your account. Public profiles expose the username you
          choose and Top Rankings progress while signed in.
        </p>
      </section>
      <section>
        <h2>Analytics</h2>
        <p>
          Cloudflare Web Analytics may measure cookieless traffic and Core Web Vitals when
          configured. PostHog EU may receive sparse product events only after you grant product
          analytics consent. Autocapture, session replay, heatmaps, and marketing/ad tracking are
          not used. Global Privacy Control (GPC) forces product analytics off.
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
          Product analytics events are intended for short retention (about 60–90 days). You can
          export or delete account data from Settings when signed in. Local-only play can be
          cleared by clearing site data in your browser.
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
