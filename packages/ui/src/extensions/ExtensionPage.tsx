import { Component, Suspense, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  name: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ExtensionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Extension "{this.props.name}" crashed
          </h2>
          <p className="text-slate-400 mb-4 max-w-md">
            {this.state.error.message}
          </p>
          <pre className="text-xs text-slate-500 bg-slate-800 rounded p-3 max-w-lg overflow-auto mb-4 max-h-40">
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-500 transition-colors"
          >
            Reload Extension
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400">Loading extension...</div>
    </div>
  );
}

interface ExtensionPageProps {
  Component: React.LazyExoticComponent<React.ComponentType>;
  name: string;
}

export function ExtensionPage({ Component, name }: ExtensionPageProps) {
  return (
    <ExtensionErrorBoundary name={name}>
      <Suspense fallback={<LoadingFallback />}>
        <Component />
      </Suspense>
    </ExtensionErrorBoundary>
  );
}
