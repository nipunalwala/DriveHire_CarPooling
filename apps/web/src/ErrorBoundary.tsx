import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Public fallback deliberately excludes error details. */
  }
  render() {
    if (this.state.failed)
      return (
        <main>
          <h1>Unable to open this page</h1>
          <p>Reload the page to try again.</p>
          <a href="/">Return home</a>
        </main>
      );
    return this.props.children;
  }
}
