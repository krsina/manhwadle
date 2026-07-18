import { LegalDoc } from './LegalDoc'

export function AttributionPage() {
  return (
    <LegalDoc title="Attribution">
      <section>
        <h2>Catalog metadata</h2>
        <p>
          Title metadata, genres, tags, descriptions, and many images come from{' '}
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            AniList
          </a>
          . AniList remains the source of truth for that data.
        </p>
      </section>
      <section>
        <h2>Images</h2>
        <p>
          Cover and character stills are requested from AniList CDN hosts and, in limited cases,
          other publicly referenced image hosts used during catalog curation. Rights remain with
          the original creators and publishers.
        </p>
      </section>
      <section>
        <h2>Audio / video (Heardle)</h2>
        <p>
          Heardle mode embeds third-party clips through YouTube. Manhwadle does not host those
          media files.
        </p>
      </section>
      <section>
        <h2>Fonts and infrastructure</h2>
        <p>
          UI fonts may load from Google Fonts. Hosting, analytics beacons, and auth/database
          services may use Cloudflare and Supabase when configured.
        </p>
      </section>
    </LegalDoc>
  )
}
