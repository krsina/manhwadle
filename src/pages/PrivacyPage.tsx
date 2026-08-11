import { LegalDoc } from './LegalDoc'

export function PrivacyPage() {
  return (
    <LegalDoc title="Privacy" updated="August 9, 2026">
      <section>
        <h2>Overview</h2>
        <p>
          You can play anonymously with progress stored in this browser. Optional account features
          use Supabase Auth.
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
          Manhwadle does not track anonymous guest play. We do not use third-party
          product-analytics trackers, advertising profiles, session replay, or device
          fingerprinting for gameplay analytics. Signed-in aggregate metrics (for example mode
          completions) are derived only from the operational account data described above and are
          available to site owners for product operations.
        </p>
      </section>
      <section>
        <h2>Advertising</h2>
        <p>
          When ads are enabled, we may show third-party display banners (Google AdSense and/or
          Adsterra) and an optional user-initiated rewarded video for in-game points. We do not
          use pop-under or push-notification ad formats.
        </p>
        <p>
          Third-party vendors, including Google, use cookies to serve ads based on a user&apos;s
          prior visits to this website or other websites. Google&apos;s use of advertising cookies
          (including the DoubleClick DART cookie) enables it and its partners to serve personalized
          ads based on visits to this site and/or other sites on the Internet. Ad scripts and
          creatives may set cookies or similar identifiers and collect device or usage data under
          each partner&apos;s policies. See{' '}
          <a
            href="https://policies.google.com/technologies/ads"
            target="_blank"
            rel="noreferrer"
          >
            How Google uses information from sites or apps that use our services
          </a>
          .
        </p>
        <p>
          On Manhwadle, when ads are live we may also show an on-site consent prompt so you can
          allow or refuse personalized advertising cookies for this site (where required, for
          example in the EEA, UK, or Switzerland). That prompt is separate from the industry
          opt-outs below.
        </p>
        <p>
          Separately, you can turn off personalized ads from Google across the web in{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer">
            Google Ads Settings
          </a>
          , or opt out of many other ad networks&apos; personalized cookies at{' '}
          <a href="https://www.aboutads.info/choices/" target="_blank" rel="noreferrer">
            aboutads.info
          </a>
          . Those tools are Google&apos;s / industry-wide controls — not Manhwadle account
          settings.
        </p>
        <p>
          When Adsterra or other non-Google ad networks serve ads here, those vendors may also use
          cookies or similar technologies. Review their privacy policies on their sites for details
          and any opt-out options they offer.
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
        <h2>Children&apos;s privacy</h2>
        <p>
          Manhwadle is not directed at children under 13, and we do not knowingly collect personal
          information from anyone under 13. If you believe a child under 13 has created an account
          or shared personal information with us, contact us using the email below and we will
          delete that information.
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
