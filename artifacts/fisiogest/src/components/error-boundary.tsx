import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Rendering error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Algo deu errado</h1>
              <p className="text-muted-foreground text-sm">
                Ocorreu um erro inesperado. Tente recarregar a página ou entre em contato com o suporte.
              </p>
              {this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Detalhes do erro
                  </summary>
                  <pre className="mt-2 text-xs bg-muted rounded-xl p-3 overflow-auto max-h-40 text-red-600">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" className="rounded-xl" onClick={this.handleReset}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar Novamente
              </Button>
              <Button className="rounded-xl" onClick={() => window.location.reload()}>
                Recarregar Página
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
