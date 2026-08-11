interface ModeGlyphProps {
  presentationKey: string
  className?: string
}

/** Line icons shared by the home mode rows and the Versus mode picker. */
export function ModeGlyph({ presentationKey, className }: ModeGlyphProps) {
  switch (presentationKey) {
    case 'character':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M5 19c1-3.2 3.2-5 7-5s6 1.8 7 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'cover':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="5"
            y="3.5"
            width="14"
            height="17"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="M8 8h8M8 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    case 'versus':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 4.6l10.6 12.6M19 4.6L8.4 17.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M13.4 16.2l3.9-2.2M10.6 16.2l-3.9-2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'heardle':
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 18V7l10-2v11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="7" cy="18" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="17" cy="16" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      )
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 5h12v14H6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M9 9h6M9 13h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
  }
}
