import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportCaughtError } from '../lib/errorReporting'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional label for monitoring / recovery copy. */
  label?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Application error boundary with accessible recovery UI.
 * Integrates with optional privacy-safe monitoring when configured.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
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
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

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
