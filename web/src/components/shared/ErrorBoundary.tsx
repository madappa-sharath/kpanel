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
        <div className="p-6">
          <p className="text-sm text-destructive mb-1">Something went wrong</p>
          <p className="text-xs text-muted-foreground font-mono mb-3">{error.message}</p>
          <button onClick={this.reset} className="text-sm underline text-muted-foreground hover:text-foreground">
            Try again
          </button>
        </div>
      )
    }
    // key forces children to remount on reset, clearing any broken state
    return <div key={resetKey}>{this.props.children}</div>
  }
}
