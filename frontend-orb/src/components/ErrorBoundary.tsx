import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="error-container">
                    <h2>Something went wrong</h2>
                    <p>We apologize for the inconvenience. Please try refreshing the page.</p>
                    <button onClick={() => window.location.reload()}>Refresh Page</button>
                    {process.env.NODE_ENV === 'development' && (
                        <pre style={{ textAlign: 'left', marginTop: '20px', fontSize: '12px', overflow: 'auto', maxWidth: '100%' }}>
                            {this.state.error?.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
