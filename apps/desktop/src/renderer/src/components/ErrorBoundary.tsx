import { Component, type ReactNode } from 'react';
import { Button } from './Button';

interface Props { children: ReactNode; reset?: () => void }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
    this.props.reset?.();
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="crash">
          <span className="eyebrow">Module crash</span>
          <h2>Something went sideways.</h2>
          <p className="muted">
            The current screen failed to render. Your data is safe — try going back or reloading.
          </p>
          <pre>{this.state.error.message}</pre>
          <div className="row" style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={this.reset}>Reset view</Button>
            <Button onClick={() => location.assign('#/')}>Go home</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
