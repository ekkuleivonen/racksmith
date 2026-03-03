import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import { HomePage } from "@/pages/HomePage";
import { ReposPage } from "@/pages/ReposPage";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="text-lg font-semibold text-zinc-100">
              Something went wrong
            </h1>
            <pre className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 p-4 rounded text-left overflow-auto max-h-48">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => this.setState({ error: null })}
                className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700"
              >
                Try again
              </button>
              <Link
                to="/"
                onClick={() => this.setState({ error: null })}
                className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700"
              >
                Go home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRoutes() {
  return (
    <div className="h-screen bg-zinc-950 flex overflow-hidden relative">
      <svg className="absolute" width="0" height="0">
        <filter id="noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none z-0"
        style={{ filter: "url(#noise)" }}
      />
      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/repos"
              element={
                <ProtectedRoute>
                  <ReposPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="lake-admin-theme">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
      <Toaster position="bottom-right" />
    </ThemeProvider>
  );
}

export default App;
