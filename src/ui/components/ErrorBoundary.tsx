import { Component, type ComponentChildren } from 'preact';

interface Props {
  readonly label?: string;
  readonly children?: ComponentChildren;
}
interface State {
  readonly failed: boolean;
}

/** Catches render errors in its subtree. Never shows a stack trace or a numeric fallback. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static override getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('ErrorBoundary caught', error);
  }

  private reset = () => this.setState({ failed: false });

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div class="error-box" role="alert">
        <p>
          <strong>{this.props.label ?? 'This section'} hit an unexpected error.</strong> No result is shown because it
          could not be trusted.
        </p>
        <button type="button" onClick={this.reset}>
          Reset and try again
        </button>
      </div>
    );
  }
}
