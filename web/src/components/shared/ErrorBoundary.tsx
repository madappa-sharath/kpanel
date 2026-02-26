import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
  resetKey: number
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }))
  }

  render() {
    const { error, resetKey } = this.state
    if (error) {
      return this.props.fallback ? (
        this.props.fallback(error, this.reset)
      ) : (
        <div style={{ padding: 24 }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--k-red)' }}>Something went wrong</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--k-muted)', fontFamily: 'var(--k-font)' }}>{error.message}</p>
          <button onClick={this.reset} className="k-btn-link" style={{ textDecoration: 'underline' }}>
            Try again
          </button>
        </div>
      )
    }
    // key forces children to remount on reset, clearing any broken state
    return <div key={resetKey}>{this.props.children}</div>
  }
}
