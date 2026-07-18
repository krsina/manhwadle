import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_IS_PLACEHOLDER,
  contactMailto,
} from '../lib/siteContact'

/** Shared legal page shell — disclosures are informational, not legal advice. */
export function LegalDoc({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <article className="legal-page">
      <p className="legal-kicker">
        <Link to="/">Home</Link>
      </p>
      <h1 className="legal-title">{title}</h1>
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
