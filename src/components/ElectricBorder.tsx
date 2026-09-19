import { useMatchMedia } from '../hooks/useMatchMedia'

interface ElectricBorderProps {
  variant?: 'first-try' | 'double-solve'
}

const LITE_MOTION_MQ = '(pointer: coarse), (max-width: 640px)'

/** Decorative SVG electricity frame for exceptional wins. */
export function ElectricBorder({ variant = 'first-try' }: ElectricBorderProps) {
  const lite = useMatchMedia(LITE_MOTION_MQ)
  const filterId =
    variant === 'double-solve' ? 'double-solve-electricity' : 'anime-electricity'

  return (
    <svg
      className={`electric-border electric-border-${variant}${lite ? ' is-lite' : ''}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {!lite && (
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.025 0.16"
              numOctaves="2"
              seed="7"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                dur="700ms"
                values="0.025 0.16;0.045 0.22;0.02 0.12;0.04 0.19;0.025 0.16"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="3.5"
              xChannelSelector="R"
              yChannelSelector="B"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="1.4" result="blur" />
            <feFlood
              floodColor={variant === 'double-solve' ? '#f59e0b' : '#2563eb'}
              floodOpacity="0.95"
              result="blue"
            />
            <feComposite in="blue" in2="blur" operator="in" result="blueGlow" />
            <feMerge>
              <feMergeNode in="blueGlow" />
              <feMergeNode in="blueGlow" />
              <feMergeNode in="displaced" />
            </feMerge>
          </filter>
        </defs>
      )}

      <g className="electric-current" filter={lite ? undefined : `url(#${filterId})`}>
        <rect
          className="electric-corona"
          x="1.5"
          y="1.5"
          width="97"
          height="97"
          rx="2.2"
          ry="2.2"
          pathLength="100"
          fill="none"
        />
        {!lite && (
          <>
            <rect
              className="electric-stream electric-stream-blue"
              x="1.5"
              y="1.5"
              width="97"
              height="97"
              rx="2.2"
              ry="2.2"
              pathLength="100"
              fill="none"
            />
            <rect
              className="electric-stream electric-stream-white"
              x="1.5"
              y="1.5"
              width="97"
              height="97"
              rx="2.2"
              ry="2.2"
              pathLength="100"
              fill="none"
            />
            <path className="electric-bolt electric-bolt-left" d="M2 18 L-2 23 L3 27 L-4 33 L2 38">
              <animate
                attributeName="d"
                dur="520ms"
                values="M2 18 L-2 23 L3 27 L-4 33 L2 38;M2 18 L-4 22 L4 27 L-2 32 L2 38;M2 18 L0 23 L-5 28 L3 33 L2 38;M2 18 L-2 23 L3 27 L-4 33 L2 38"
                repeatCount="indefinite"
              />
            </path>
            <path className="electric-bolt electric-bolt-right" d="M98 48 L103 53 L96 58 L104 63 L98 68">
              <animate
                attributeName="d"
                dur="610ms"
                values="M98 48 L103 53 L96 58 L104 63 L98 68;M98 48 L105 52 L97 57 L102 63 L98 68;M98 48 L101 54 L105 58 L96 64 L98 68;M98 48 L103 53 L96 58 L104 63 L98 68"
                repeatCount="indefinite"
              />
            </path>
            <path className="electric-bolt electric-bolt-top" d="M56 2 L61 -3 L66 3 L72 -4 L78 2">
              <animate
                attributeName="d"
                dur="470ms"
                values="M56 2 L61 -3 L66 3 L72 -4 L78 2;M56 2 L60 -5 L67 4 L71 -2 L78 2;M56 2 L62 0 L66 -5 L73 3 L78 2;M56 2 L61 -3 L66 3 L72 -4 L78 2"
                repeatCount="indefinite"
              />
            </path>
            <path className="electric-bolt electric-bolt-bottom" d="M16 98 L22 103 L28 97 L34 104 L41 98">
              <animate
                attributeName="d"
                dur="680ms"
                values="M16 98 L22 103 L28 97 L34 104 L41 98;M16 98 L21 105 L27 96 L35 102 L41 98;M16 98 L23 100 L29 105 L34 96 L41 98;M16 98 L22 103 L28 97 L34 104 L41 98"
                repeatCount="indefinite"
              />
            </path>
          </>
        )}
      </g>
    </svg>
  )
}
