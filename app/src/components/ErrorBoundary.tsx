import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorReporting } from '@/services/errorReporting';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    
    // Report to error reporting service
    errorReporting.reportError({
      type: 'error',
      message: error.message,
      stack: error.stack,
      component: 'ErrorBoundary',
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const suggestedFix = this.state.error 
        ? errorReporting.getSuggestedFix({
            id: '',
            timestamp: '',
            type: 'error',
            message: this.state.error.message,
            stack: this.state.error.stack,
            userAgent: navigator.userAgent,
            url: window.location.href,
            resolved: false,
            autoFixable: false,
          })
        : null;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl">Something Went Wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400 text-center">
                We apologize for the inconvenience. An unexpected error has occurred.
              </p>

              {this.state.error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="font-medium text-red-800 dark:text-red-200">Error Details:</p>
                  <p className="text-sm text-red-700 dark:text-red-300 font-mono mt-1">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              {suggestedFix && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">Suggested Fix:</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    {suggestedFix}
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <Button onClick={this.handleReload} variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reload Page
                </Button>
                <Button onClick={this.handleGoHome}>
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </div>

              <p className="text-xs text-gray-400 text-center mt-4">
                Error ID: {Date.now().toString(36)} | This error has been logged for review
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
