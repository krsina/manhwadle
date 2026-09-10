import type { AchievementCategory } from '../lib/achievements'

export function AchievementIcon({
  id,
  category,
}: {
  id?: string
  category: AchievementCategory
}) {
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (id) {
    case 'all_mode_streak_7': // Perfect Week — checked calendar
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect {...line} x="4" y="5.5" width="16" height="14" rx="2" />
          <path {...line} d="M4 9.5h16M8 3.8v3.4M16 3.8v3.4m-7.2 7.2 2.1 2.1 4.4-4.6" />
        </svg>
      )
    case 'all_mode_days_25': // Omnivore — fork, plate, and spoon
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle {...line} cx="12" cy="12.5" r="5.2" />
          <path {...line} d="M4 4.5v5.2m-1.5-5.2v3.1c0 1 .7 1.8 1.5 1.8s1.5-.8 1.5-1.8V4.5M4 9.7v9.8M20 19.5v-7.2c-1.6-.4-2.5-1.7-2.5-3.6 0-2.2 1-3.7 2.5-4.2v15Z" />
        </svg>
      )
    case 'all_mode_streak_3': // Combo — unambiguous multiplier
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <text
            x="12"
            y="16.2"
            fill="currentColor"
            fontFamily="system-ui, sans-serif"
            fontSize="12.5"
            fontWeight="900"
            letterSpacing="-0.8"
            textAnchor="middle"
          >
            ×3
          </text>
        </svg>
      )
    case 'all_mode_days_50': // Collector — stacked collectible cards
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect {...line} x="7" y="4" width="11" height="15" rx="1.7" />
          <path {...line} d="M7 7H5.8C4.8 7 4 7.8 4 8.8v9.4C4 19.2 4.8 20 5.8 20H14m-1.5-12.4 1.1 2.2 2.4.3-1.7 1.7.4 2.4-2.2-1.1-2.2 1.1.4-2.4L9 10.1l2.4-.3 1.1-2.2Z" />
        </svg>
      )
    case 'all_mode_streak_60': // No Skip — crossed-out skip control
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...line} d="m6 6 8 6-8 6V6Zm9.5 1v10M4 4l16 16" />
        </svg>
      )
    case 'all_mode_days_100': // Vault — combination safe
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect {...line} x="4" y="4" width="16" height="16" rx="2.2" />
          <circle {...line} cx="12" cy="12" r="4" />
          <path {...line} d="M12 8v2.1m0 3.8V16m-4-4h2.1m3.8 0H16M6.5 7.2h.1m-.1 9.6h.1" />
        </svg>
      )
    case 'all_mode_streak_100': // Floor Master — trophy over cleared floors
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...line} d="M8 4.5h8v3.2c0 2.8-1.8 4.8-4 4.8s-4-2-4-4.8V4.5Zm0 1.8H5.2v1.2c0 2 1.3 3.4 3.2 3.4m7.6-4.6h2.8v1.2c0 2-1.3 3.4-3.2 3.4M12 12.5v3m-3 0h6M7 19.5h10" />
        </svg>
      )
    case 'all_mode_days_180': // Archive Key — key and book
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...line} d="M4.5 5.5h4c1.9 0 3.5 1.6 3.5 3.5v10c0-1.9-1.6-3.5-3.5-3.5h-4v-10Zm15 0h-4C13.6 5.5 12 7.1 12 9v10c0-1.9 1.6-3.5 3.5-3.5h4v-10Z" />
          <circle {...line} cx="16" cy="9.5" r="1.5" />
          <path {...line} d="m14.9 10.6-2.5 2.5m0 0 1 1m-1-1-.9.9" />
        </svg>
      )
    case 'all_mode_streak_180': // Half-Realm — divided world
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle {...line} cx="12" cy="12" r="8" />
          <path {...line} d="M4 12h16M12 4c-2.2 2.3-3.3 5-3.3 8s1.1 5.7 3.3 8" />
          <path fill="currentColor" d="M12 4a8 8 0 0 1 0 16V4Z" opacity=".28" />
        </svg>
      )
    case 'secret_cascade': // Cascade — falling panels
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect {...line} x="4" y="4" width="6" height="6" rx="1" />
          <rect {...line} x="9" y="9" width="6" height="6" rx="1" />
          <rect {...line} x="14" y="14" width="6" height="6" rx="1" />
          <path {...line} d="m6.2 7 1.1 1.1 1.6-1.8m2.3 5.7 1.1 1.1 1.6-1.8m2.3 5.7 1.1 1.1 1.6-1.8" />
        </svg>
      )
    default:
      return <LegacyAchievementIcon id={id} category={category} />
  }
}

/** Previous silhouette glyphs, retained for the local comparison page. */
export function LegacyAchievementIcon({
  id,
  category,
}: {
  id?: string
  category: AchievementCategory
}) {
  switch (id) {
    case 'first_completion': // Awakening — rising eye / system ping
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 5.2c-4.2 0-7.6 2.6-9.2 6.3a.9.9 0 0 0 0 .8C4.4 16.1 7.8 18.8 12 18.8s7.6-2.7 9.2-6.5a.9.9 0 0 0 0-.8C19.6 7.8 16.2 5.2 12 5.2Zm0 10.4a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
          />
          <circle cx="12" cy="12" r="1.55" fill="var(--panel, #151922)" />
        </svg>
      )
    case 'completions_5': // Tutorial — training dummy / target
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'completions_10': // Cameo — small figure in frame
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="2.2" fill="currentColor" />
          <circle cx="12" cy="10" r="2.2" fill="var(--panel, #151922)" />
          <path
            d="M7.8 17.2c.7-2.2 2.3-3.3 4.2-3.3s3.5 1.1 4.2 3.3"
            fill="none"
            stroke="var(--panel, #151922)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'completions_25': // Canon Event — stamped seal
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.4 14.2 8l5 .7-3.6 3.6.9 5.1L12 15.1 7.5 17.4l.9-5.1L4.8 8.7l5-.7L12 3.4Z"
          />
        </svg>
      )
    case 'completions_50': // Nameplate — plaque
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="7.2" width="17" height="9.6" rx="1.6" fill="currentColor" />
          <path
            d="M7 11.2h10M7.8 14h6.5"
            stroke="var(--panel, #151922)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'completions_100': // Binge — stacked panels
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.2 6.2h11.6v11.6H6.2zM8.4 4.4h11.6v1.8H8.4zM10.2 16.8h11.2v1.8H10.2z"
          />
        </svg>
      )
    case 'completions_250': // Haunt — ghost book
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 4.5h9.2c1.2 0 2.2 1 2.2 2.2v11.4c0 .7-.8 1.1-1.4.7l-1.6-1.1-1.6 1.1c-.5.4-1.2.4-1.7 0L10.5 17.7 8.9 18.8c-.6.4-1.4 0-1.4-.7V6.7c0-1.2 1-2.2 2.2-2.2H7Z"
          />
          <circle cx="11" cy="10.2" r="1" fill="var(--panel, #151922)" />
          <circle cx="14.4" cy="10.2" r="1" fill="var(--panel, #151922)" />
        </svg>
      )
    case 'completions_500': // Subscribed (infinite loop)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8.2 7.2c-2.4 0-4.2 1.7-4.2 4s1.8 4 4.2 4c1.3 0 2.3-.5 3.2-1.3L14 16.5c-1.3 1.2-2.9 1.9-4.8 1.9-4 0-7-2.9-7-6.6s3-6.6 7-6.6c2 0 3.6.7 4.9 1.9L11.4 9.7c-.8-.9-1.8-1.4-3.2-1.4Zm7.6 0c-1.3 0-2.3.5-3.2 1.3L9.9 6.1C11.2 4.9 12.9 4.2 14.8 4.2c4 0 7 2.9 7 6.6s-3 6.6-7 6.6c-2 0-3.6-.7-4.9-1.9l2.7-2.6c.8.9 1.8 1.4 3.2 1.4 2.4 0 4.2-1.7 4.2-4s-1.8-4-4.2-4Z"
          />
        </svg>
      )
    case 'completions_750': // Back Catalog (stacked shelves)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.8 5.2h14.4v2.2H4.8V5.2Zm0 4.4h14.4v2.2H4.8V9.6Zm0 4.4h14.4v2.2H4.8v-2.2Zm0 4.4h9.6V20H4.8v-1.6Z"
          />
        </svg>
      )
    case 'completions_1000': // Hardcover
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.2 4.4h11.6c1 0 1.8.8 1.8 1.8v11.6c0 1-.8 1.8-1.8 1.8H6.2c-1 0-1.8-.8-1.8-1.8V6.2c0-1 .8-1.8 1.8-1.8Zm1.8 2.4v10.4h8V6.8H8Zm1.6 2h4.8v1.6H9.6V8.8Zm0 3.2h3.6v1.6H9.6v-1.6Z"
          />
        </svg>
      )
    case 'completions_3000': // Lifetime Deal (seal)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Zm0 2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2Zm-2.4 3.6h4.8v1.7H9.6V9Zm0 3.2h4.8v1.7H9.6v-1.7Z"
          />
        </svg>
      )

    case 'any_streak_2': // You came back! (surprised double mark / return)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.2 4.4h2.2v9.2H7.2V4.4Zm0 11.2h2.2V18H7.2v-2.4Zm7.4-11.2h2.2v9.2h-2.2V4.4Zm0 11.2h2.2V18h-2.2v-2.4Z"
          />
        </svg>
      )
    case 'any_streak_3': // To Be Continued — arrow cliffhanger
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.5 11.1h9.2V7.6L19.5 12l-5.8 4.4v-3.5H4.5z"
          />
        </svg>
      )
    case 'any_streak_7': // Friday Drop — calendar spark
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.2 3.8h1.8v1.6h6V3.8h1.8v1.6h2.2c1 0 1.8.8 1.8 1.8v11c0 1-.8 1.8-1.8 1.8H5.2c-1 0-1.8-.8-1.8-1.8v-11c0-1 .8-1.8 1.8-1.8h2V3.8Zm11 6.2H5.8v7.4h12.4V10Z"
          />
          <circle cx="9.2" cy="14.2" r="1.1" fill="var(--panel, #151922)" />
          <circle cx="12" cy="14.2" r="1.1" fill="var(--panel, #151922)" />
          <circle cx="14.8" cy="14.2" r="1.1" fill="var(--panel, #151922)" />
        </svg>
      )
    case 'any_streak_14': // Algorithm — signal bars
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5 16.8h2.4V19H5zm4.2-4h2.4V19H9.2zm4.2-4h2.4V19h-2.4zm4.2-4.8H20V19h-2.4z"
          />
        </svg>
      )
    case 'any_streak_30': // Mid-Boss — horned mask
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6.2 5.2 4.4 8.6c1.1.4 2 .8 2.4 1.6L5.2 16.8c1.8 1.5 3.8 2.3 6.8 2.3s5-.8 6.8-2.3l-1.6-6.6c.4-.8 1.3-1.2 2.4-1.6l-1.8-3.4c-1.5.8-2.9 1.2-4.2 1.2-.8 0-1.5-.1-2.2-.4-.7.3-1.4.4-2.2.4-1.3 0-2.7-.4-4.2-1.2Zm3.4 6.1c.7 0 1.2.6 1.2 1.3S10.3 14 9.6 14s-1.2-.6-1.2-1.4.5-1.3 1.2-1.3Zm4.8 0c.7 0 1.2.6 1.2 1.3s-.5 1.4-1.2 1.4-1.2-.6-1.2-1.4.5-1.3 1.2-1.3Z"
          />
        </svg>
      )
    case 'any_streak_60': // No Hiatus — unbroken chain
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M9.4 8.2c-1.9 0-3.4 1.5-3.4 3.4s1.5 3.4 3.4 3.4h1.4v1.9H9.4c-2.9 0-5.3-2.4-5.3-5.3S6.5 6.3 9.4 6.3h1.4v1.9H9.4Zm5.2 0h-1.4V6.3h1.4c2.9 0 5.3 2.4 5.3 5.3s-2.4 5.3-5.3 5.3h-1.4v-1.9h1.4c1.9 0 3.4-1.5 3.4-3.4s-1.5-3.4-3.4-3.4Zm-4.4 2.4h4v1.9h-4z"
          />
        </svg>
      )
    case 'any_streak_100': // Cultivation (ascending tower)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M11.1 3.6h1.8v2.2h3.4L14.8 9H17l-1.4 3.2H18L12 20.4 6 12.2h2.4L7 9h2.2L7.7 5.8h3.4V3.6Z"
          />
        </svg>
      )
    case 'any_streak_365': // Year One (sun ring)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 5.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6Zm0 2.2a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2ZM11.1 2.4h1.8v2.2h-1.8V2.4Zm0 17h1.8v2.2h-1.8V19.4ZM2.4 11.1H4.6v1.8H2.4v-1.8Zm17 0H21.6v1.8H19.4v-1.8Z"
          />
        </svg>
      )
    case 'any_streak_730': // Second Season (twin marks)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.2 4.8h3.2v14.4H7.2V4.8Zm6.4 0H16.8v14.4H13.6V4.8Z"
          />
        </svg>
      )

    case 'all_mode_day': // Full Party (four-mode grid)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.8 4.8h6v6h-6zm8.4 0h6v6h-6zm-8.4 8.4h6v6h-6zm8.4 0h6v6h-6z"
          />
        </svg>
      )
    case 'all_mode_streak_1': // Clean Sweep — single broom sweep / check grid
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.2 5.2h5.2v5.2H5.2V5.2Zm8.4 0H18.8v5.2H13.6V5.2ZM5.2 13.6h5.2V18.8H5.2V13.6Zm8.8 1.2 1.4-1.4 2.4 2.4 3.2-3.2 1.4 1.4-4.6 4.6-3.8-3.8Z"
          />
        </svg>
      )
    case 'all_mode_streak_2': // Double Feature — two tickets / twin checks
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.4 6.2h6.8v11.6H4.4V6.2Zm1.8 2v1.8h3.2V8.2H6.2Zm0 3.4v1.8h3.2v-1.8H6.2Zm8.6-3.4h6.8v11.6h-6.8V8.2Zm1.8 2v1.8h3.2V10.2h-3.2Zm0 3.4v1.8h3.2v-1.8h-3.2Z"
          />
        </svg>
      )
    case 'all_mode_days_5': // Limited Drop — gem
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8.2 4.6h7.6L20 9.2 12 19.4 4 9.2 8.2 4.6Zm1.1 1.8L7.2 9h2.8l1.1-2.6H9.3Zm2.7 0L10.8 9h2.4l-1.2-2.6Zm3.7 0h-1.8L14 9h2.8l-1.1-2.6ZM8.1 10.8l2.4 5.5 1.5-5.5H8.1Zm4.9 0-1.5 5.5 2.4-5.5h-0.9Z"
          />
        </svg>
      )
    case 'all_mode_streak_3': // Combo — linked rings
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M9.2 7.2a4.6 4.6 0 1 0 3.3 7.8 4.6 4.6 0 1 0 0-1.9 4.6 4.6 0 0 0-3.3-5.9Zm0 1.9a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Zm5.6 0a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z"
          />
        </svg>
      )
    case 'all_mode_streak_7': // Perfect Week — laurel check
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.5c1.8 1.4 3 3.4 3.4 5.6-.9-.5-1.9-.8-3-.9v2c.8.1 1.5.4 2.1.8-.1 1.4-.7 2.7-1.7 3.7L12 15.8l-.8-1.1c-1-1-1.6-2.3-1.7-3.7.6-.4 1.3-.7 2.1-.8v-2c-1.1.1-2.1.4-3 .9C9 6.9 10.2 4.9 12 3.5Zm-6.8 7.2c.4 3.3 2.4 6 5.1 7.4L9 20.4c-3.4-1.7-5.8-5.1-6.2-9.1.8-.3 1.6-.5 2.4-.6Zm13.6 0c.8.1 1.6.3 2.4.6-.4 4-2.8 7.4-6.2 9.1l1.3-2.3c2.7-1.4 4.7-4.1 5.1-7.4Z"
          />
        </svg>
      )
    case 'all_mode_days_25': // Omnivore — devouring maw / open book jaws
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4.2 4.5 7.4v9.2L12 19.8l7.5-3.2V7.4L12 4.2Zm0 2.1 5.2 2.2v1.4L12 12.1 6.8 9.9V8.5L12 6.3Zm-5.2 5.2L12 14l5.2-2.5v3.3L12 17.6l-5.2-2.8v-3.3Z"
          />
        </svg>
      )
    case 'all_mode_streak_14': // Tower Floor — stepped tower
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M9.5 3.8h5v2.4h2.4v2.6H19v3H4.8V8.8h2.3V6.2h2.4V3.8Zm-2.4 9.4h9.8V20H7.1v-6.8Z"
          />
        </svg>
      )
    case 'all_mode_streak_30': // Ranker (crown)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.2 9.2 8.4 12l3.6-5.2L15.6 12l3.2-2.8-.8 8.2H6l-.8-8.2ZM7.4 17.8h9.2V19.6H7.4z"
          />
        </svg>
      )
    case 'all_mode_days_365': // Yearbook
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.4 4.6h13.2v14.8H5.4V4.6Zm2 2.2v10.4h9.2V6.8H7.4Zm1.8 2h5.6v1.6H9.2V8.8Zm0 3.2h5.6v1.6H9.2v-1.6Zm0 3.2h3.6v1.6H9.2v-1.6Z"
          />
        </svg>
      )
    case 'all_mode_streak_365': // Solar Clear
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4.2 14.8 9l5.4.6-4 3.7 1.1 5.3L12 16.2 6.7 18.6l1.1-5.3-4-3.7L9.2 9 12 4.2Zm0 3.4L10.6 10l-2.8.3 2.1 1.9-.6 2.8L12 13.6l2.7 1.4-.6-2.8 2.1-1.9-2.8-.3L12 7.6Z"
          />
        </svg>
      )
    case 'all_mode_streak_730': // Twin Suns
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8.2 7.2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm7.6 0a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
          />
        </svg>
      )

    case 'secret_early_bird': // Early Bird — dawn sun + bird
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.2c.4 0 .8.3.8.8v1.4h-1.6V4c0-.5.4-.8.8-.8Zm6.2 2.4 1.1 1.1-1 1-1.1-1.1 1-1ZM5.8 5.6l1 1-1.1 1.1-1-1 1.1-1.1ZM12 6.4a5 5 0 0 1 5 5H7a5 5 0 0 1 5-5Zm-8.2 6.2h2.4v1.6H3.8v-1.6Zm14 0h2.4v1.6h-2.4v-1.6ZM4.2 15.2h15.6v1.6H4.2v-1.6Zm2.4 2.4h11.2v1.6H6.6v-1.6Zm8.6-7.2c1.4.2 2.4 1.1 2.6 2.4-.8-.2-1.6-.1-2.3.3-.9.5-1.4 1.2-1.5 2.1-.6-1.1-.4-2.5.4-3.5.4-.4.8-.7 1.2-.9.1-.1.2-.1.4-.1Z"
          />
        </svg>
      )
    case 'visit_comeback_1': // Regression — rewind / hourglass flip
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8.2 3.6h7.6v2.2h-1.2l1.4 2.4c.7 1.2.7 2.7 0 3.9L14.2 15h1.6v2.2H8.2V15h1.6l-1.8-3c-.7-1.2-.7-2.7 0-3.9l1.4-2.4H8.2V3.6Zm3.8 4.2L10.4 11h3.2l-1.6-3.2Zm0 8.6 1.6-3.2h-3.2l1.6 3.2Z"
          />
        </svg>
      )
    case 'visit_comeback_3': // Second Life — phoenix spark / revival
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.4c.4 2.4-1.1 3.8-2.4 5.2-1.8 1.8-3.2 3.4-3.2 5.8a5.6 5.6 0 0 0 11.2 0c0-2.4-1.4-4-3.2-5.8C13.1 7.2 11.6 5.8 12 3.4Zm0 7.2c1.4 1.4 2.4 2.6 2.4 4a2.4 2.4 0 0 1-4.8 0c0-1.4 1-2.6 2.4-4Z"
          />
        </svg>
      )
    case 'visit_comeback_5': // Reincarnation — cycle arrows
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4.2a7.6 7.6 0 0 1 7.2 5.2h-2.2A5.6 5.6 0 0 0 8.4 7.8L10 9.4H5.2V4.6l1.6 1.6A7.6 7.6 0 0 1 12 4.2Zm0 15.6a7.6 7.6 0 0 1-7.2-5.2h2.2a5.6 5.6 0 0 0 8.6 1.6L14 14.6h4.8v4.8l-1.6-1.6A7.6 7.6 0 0 1 12 19.8Z"
          />
        </svg>
      )
    case 'visit_comeback_10': // Protagonist Arc — rising star
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.2 13.8 8l5 .7-3.6 3.5.9 5.1L12 15.1 7.9 17.3l.9-5.1L5.2 8.7l5-.7L12 3.2Zm-6.4 16.2h12.8v1.8H5.6v-1.8Z"
          />
        </svg>
      )
    case 'visit_timeskip': // Time Skip (clock jump)
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Zm0 1.9a6.7 6.7 0 1 0 0 13.4 6.7 6.7 0 0 0 0-13.4Zm.9 2.4v4.1l3.2 1.9-.9 1.5-4.1-2.4V7.7h1.8Z"
          />
        </svg>
      )

    case 'secret_konami':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 4.5h8v3.2H8V4.5Zm-3.2 5.2h5.2v3.2H4.8V9.7Zm8.4 0h6v3.2h-6V9.7ZM7.2 15h3.2v4.5H7.2V15Zm6.4 0H16.8v4.5H13.6V15Z"
          />
        </svg>
      )
    case 'secret_background':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.5 7.2h15v1.8H4.5V7.2Zm2 3.6h11v9H6.5v-9Zm3.2 2.2v4.6h4.6v-4.6H9.7Z"
          />
        </svg>
      )
    case 'secret_perfect':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.2 14.2 9l6 .7-4.4 4.1 1.2 5.8L12 16.8 6.999 19.6l1.2-5.8L3.8 9.7l6-.7L12 3.2Z"
          />
        </svg>
      )
    case 'secret_account_menu':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4.2a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8ZM5.6 18.8c0-3.2 2.9-5.2 6.4-5.2s6.4 2 6.4 5.2v1H5.6v-1Z"
          />
        </svg>
      )
    case 'secret_lights':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3.2c.5 2.8-.8 4.4-2 5.8-1.5 1.7-2.6 3.2-2.6 5.2a4.6 4.6 0 0 0 9.2 0c0-2-1.1-3.5-2.6-5.2-1.2-1.4-2.5-3-2-5.8Zm-2.2 14.2h4.4v1.8h-1.2v1.4h-2v-1.4H9.8v-1.8Z"
          />
        </svg>
      )
    case 'secret_cascade':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.2 5.2a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Zm9.6 2.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2ZM12 11.2a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z"
          />
        </svg>
      )

    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {category === 'streak' ? (
            <path
              fill="currentColor"
              d="M13.2 3.8c.3 2.2-1 3.4-2.2 4.6-1.6 1.5-2.8 3-2.8 5.1a3.8 3.8 0 0 0 7.6 0c0-2.6-1.7-4.1-2.7-5.8-.7-1.2-1-2.3 0-3.9Z"
            />
          ) : category === 'all_mode' ? (
            <path
              fill="currentColor"
              d="M7.2 9.2 12 6.8l4.8 2.4-1.1 5.8H8.3Z"
            />
          ) : category === 'visit' ? (
            <path
              fill="currentColor"
              d="M12 4.2c2.8 0 5.1 2.1 5.1 4.8S14.8 13.8 12 13.8 6.9 11.7 6.9 9 9.2 4.2 12 4.2Zm0 11.2c3.4 0 6.2 1.4 6.2 2.4v1.6H5.8V17.8c0-1 2.8-2.4 6.2-2.4Z"
            />
          ) : category === 'secret' ? (
            <path
              fill="currentColor"
              d="M12 4.4c2.4 0 4.4 1.8 4.4 4.2v1.6h1.4c.9 0 1.6.7 1.6 1.6v6.4c0 .9-.7 1.6-1.6 1.6H6.2c-.9 0-1.6-.7-1.6-1.6v-6.4c0-.9.7-1.6 1.6-1.6H7.6V8.6c0-2.4 2-4.2 4.4-4.2Zm0 1.9c-1.3 0-2.4 1-2.4 2.3v1.6h4.8V8.6c0-1.3-1.1-2.3-2.4-2.3Z"
            />
          ) : (
            <path
              fill="currentColor"
              d="M6.8 12.4 10.2 16l7-8.2-1.5-1.3-5.4 6.3-2.2-2.3z"
            />
          )}
        </svg>
      )
  }
}

export function achievementCategoryLabel(category: AchievementCategory): string {
  switch (category) {
    case 'streak':
      return 'Streak'
    case 'all_mode':
      return 'Full clear'
    case 'visit':
      return 'Hush-Hush'
    case 'secret':
      return 'Hush-Hush'
    default:
      return 'Completion'
  }
}

/** Modal / section kicker for the achievement family. */
export function achievementTypeKicker(category: AchievementCategory): string {
  switch (category) {
    case 'streak':
      return 'Streaks'
    case 'all_mode':
      return 'Full clears'
    case 'visit':
    case 'secret':
      return 'Hush-Hush'
    default:
      return 'Completions'
  }
}
