import React from 'react';
type Props = { children: React.ReactNode };
type State = { failed: boolean };
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="error-page">
        <h1>We hit a snag</h1>
        <p>Reload the page to try again.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
