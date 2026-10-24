import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Called when the user chooses to reset after an error. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors in the explorer subtree and shows a safe fallback
 * instead of a blank screen. It never logs raw genetic data — only the error
 * message/stack, which are developer diagnostics, not sample data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(): void {
    // Intentionally no logging: avoids any risk of sample data reaching logs.
    // getDerivedStateFromError already captured the error for the fallback UI.
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <section className="error-boundary" role="alert">
          <h2>Something went wrong displaying the explorer</h2>
          <p className="subtitle">
            The view hit an unexpected error and was stopped to avoid showing
            incorrect results. No data was changed. You can reset and try again.
          </p>
          <p className="subtitle">
            Details: {this.state.error.message}
          </p>
          <button onClick={this.handleReset}>Reset</button>
        </section>
      );
    }
    return this.props.children;
  }
}
