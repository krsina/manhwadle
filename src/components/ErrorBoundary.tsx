import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportCaughtError } from '../lib/errorReporting'
import { isStaleAssetError, reloadForStaleAssets } from '../lib/staleAssetReload'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional label for monitoring / recovery copy. */
  label?: string
}

interface ErrorBoundaryState {
  error: Error | null
  reloadingForUpdate: boolean
}

/**
 * Application error boundary with accessible recovery UI.
 * Integrates with optional privacy-safe monitoring when configured.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, reloadingForUpdate: false }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isStaleAssetError(error) && reloadForStaleAssets('error-boundary')) {
      this.setState({ reloadingForUpdate: true })
      return
    }
    reportCaughtError(error, {
      source: 'ErrorBoundary',
      label: this.props.label ?? 'app',
      componentStack: info.componentStack ?? undefined,
    })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleReset = (): void => {
    this.setState({ error: null, reloadingForUpdate: false })
  }

  render() {
    const { error, reloadingForUpdate } = this.state
    if (!error) return this.props.children

    if (isStaleAssetError(error)) {
      return (
        <div className="error-boundary" role="status" aria-live="polite">
          <div className="error-boundary-card">
            <p className="error-boundary-kicker">Updating</p>
            <h1 className="error-boundary-title">Loading the latest Manhwadle</h1>
            <p className="error-boundary-body">
              {reloadingForUpdate
                ? 'A new version just shipped. Refreshing so you can keep playing.'
                : 'A new version just shipped. Reload to pick it up — your local progress stays in this browser.'}
            </p>
            {!reloadingForUpdate && (
              <div className="error-boundary-actions">
                <button type="button" className="btn btn-primary" onClick={this.handleReload}>
                  Reload page
                </button>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="error-boundary" role="alert" aria-live="assertive">
        <div className="error-boundary-card">
          <p className="error-boundary-kicker">Something went wrong</p>
          <h1 className="error-boundary-title">Manhwadle hit an unexpected error</h1>
          <p className="error-boundary-body">
            Your local progress is usually still saved in this browser. You can try
            recovering without leaving, or reload the page.
          </p>
          <p className="error-boundary-detail">
            <span className="visually-hidden">Error details: </span>
            {error.message || 'Unknown error'}
          </p>
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleReset}>
              Try to recover
            </button>
            <button type="button" className="btn btn-ghost" onClick={this.handleReload}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
