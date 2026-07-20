/** Public contact for privacy, support, and moderation appeals. */
export const CONTACT_EMAIL = 'support@manhwadle.net'

/** Human-readable label shown in UI when still unconfigured. */
export const CONTACT_EMAIL_IS_PLACEHOLDER = CONTACT_EMAIL.endsWith('.invalid')

export function contactMailto(): string {
  return `mailto:${CONTACT_EMAIL}`
}
