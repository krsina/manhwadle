import type { ReactNode } from 'react'
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_IS_PLACEHOLDER,
  contactMailto,
} from '../lib/siteContact'
import { useLegalSecretPing } from '../lib/useSecretPagePings'

/** Shared legal page shell. Disclosures are informational, not legal advice. */
export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string
  /** Visible “Last updated” stamp when the policy text meaningfully changes. */
  updated?: string
  children: ReactNode
}) {
  useLegalSecretPing()

  return (
    <article className="legal-page">
      <h1 className="legal-title">{title}</h1>
      {updated && <p className="legal-updated">Last updated: {updated}</p>}
      <p className="legal-disclaimer">
        This page describes how Manhwadle works today. It is not legal advice. Policies may
        change as the project evolves.
      </p>
      <div className="legal-body">{children}</div>
      <p className="legal-contact">
        Contact:{' '}
        {CONTACT_EMAIL_IS_PLACEHOLDER ? (
          <span className="legal-contact-placeholder" role="status">
            {CONTACT_EMAIL} (configure before launch)
          </span>
        ) : (
          <a href={contactMailto()}>{CONTACT_EMAIL}</a>
        )}
      </p>
    </article>
  )
}
