/**
 * Privacy-safe error reporting integration point.
 *
 * Default: console only (safe for anonymous local play).
 * Host apps / bootstraps may register a reporter when a DSN is configured
 * (for example Sentry with replay off, sendDefaultPii false, low sample).
 */

export type ErrorReportContext = {
  source?: string
  label?: string
  componentStack?: string
}

export type ErrorReporter = (error: unknown, context: ErrorReportContext) => void

let reporter: ErrorReporter | null = null

function getEnv(name: string): string {
  try {
    const value = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[name]
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

/** True when an optional monitoring DSN env is present (integration may still be pending). */
export function isErrorMonitoringConfigured(): boolean {
  return Boolean(getEnv('VITE_SENTRY_DSN')) || reporter != null
}

/** Register a privacy-safe reporter (call once at bootstrap when monitoring is enabled). */
export function registerErrorReporter(next: ErrorReporter | null): void {
  reporter = next
}

/** Report a caught error without blocking local anonymous play. */
export function reportCaughtError(error: unknown, context: ErrorReportContext = {}): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${context.source ?? 'app'}]`, message, context.label ?? '', error)
  try {
    reporter?.(error, {
      source: context.source,
      label: context.label,
      // Presence only — never forward raw component stacks with user content.
      componentStack: context.componentStack ? '[present]' : undefined,
    })
  } catch {
    /* monitoring must never break recovery UI */
  }
}
