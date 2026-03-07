import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/auth-context";
import { CodePage } from "@/pages/CodePage";
import { DiffCommitPage } from "@/pages/DiffCommitPage";
import { DiffReviewPage } from "@/pages/DiffReviewPage";
import { HomePage } from "@/pages/HomePage";
import { ReposPage } from "@/pages/ReposPage";
import { SetupPage } from "@/pages/SetupPage";
import { StackCreatePage } from "@/pages/StackCreatePage";
import { StackDetailPage } from "@/pages/StackDetailPage";
import { StacksPage } from "@/pages/StacksPage";
import { RackPage } from "@/pages/RackDetailPage";
import { NodePage } from "@/pages/NodePage";
import { GroupsPage } from "@/pages/GroupsPage";
import { GroupDetailPage } from "@/pages/GroupDetailPage";
import { GroupCreatePage } from "@/pages/GroupCreatePage";
import { RackOnboardingPage } from "@/pages/RackOnboardingPage";
import { RacksPage } from "@/pages/RacksPage";
import { NodesPage } from "@/pages/NodesPage";
import { NodeCreatePage } from "@/pages/NodeCreatePage";
import { ActionNewPage } from "@/pages/ActionNewPage";

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
            <h1 className="text-lg font-semibold text-zinc-100">Something went wrong</h1>
            <pre className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 p-4 rounded text-left overflow-auto max-h-48">
              {this.state.error.message}
            </pre>
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
      <div className="flex-1 min-w-0 w-full flex flex-col relative z-10">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route
              path="/repos"
              element={
                <ProtectedRoute>
                  <AppShell title="Repos">
                    <ReposPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/racks"
              element={
                <ProtectedRoute>
                  <AppShell title="Racks">
                    <RacksPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/rack"
              element={
                <ProtectedRoute>
                  <Navigate to="/racks" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rack/create"
              element={
                <ProtectedRoute>
                  <AppShell title="Racks">
                    <RackOnboardingPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/rack/view/:rackSlug"
              element={
                <ProtectedRoute>
                  <AppShell title="Racks">
                    <RackPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/nodes"
              element={
                <ProtectedRoute>
                  <AppShell title="Nodes">
                    <NodesPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/nodes/create"
              element={
                <ProtectedRoute>
                  <AppShell title="Nodes">
                    <NodeCreatePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/nodes/:slug"
              element={
                <ProtectedRoute>
                  <AppShell title="Nodes">
                    <NodePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/groups"
              element={
                <ProtectedRoute>
                  <AppShell title="Groups">
                    <GroupsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/groups/create"
              element={
                <ProtectedRoute>
                  <AppShell title="Groups">
                    <GroupCreatePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/groups/:slug"
              element={
                <ProtectedRoute>
                  <AppShell title="Groups">
                    <GroupDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/code/:owner/:repo/*"
              element={
                <ProtectedRoute>
                  <AppShell title="Code">
                    <CodePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/code"
              element={
                <ProtectedRoute>
                  <AppShell title="Code">
                    <CodePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stacks"
              element={
                <ProtectedRoute>
                  <AppShell title="Stacks">
                    <StacksPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stacks/create"
              element={
                <ProtectedRoute>
                  <AppShell title="Stacks">
                    <StackCreatePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/stacks/:stackId"
              element={
                <ProtectedRoute>
                  <AppShell title="Stacks">
                    <StackDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/diff/review"
              element={
                <ProtectedRoute>
                  <AppShell title="Review changes">
                    <DiffReviewPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/diff/commit"
              element={
                <ProtectedRoute>
                  <AppShell title="Commit changes">
                    <DiffCommitPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/actions/new"
              element={
                <ProtectedRoute>
                  <AppShell title="New action">
                    <ActionNewPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
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
