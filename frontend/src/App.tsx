import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell, OnboardingShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/auth-context";
import { queryClient } from "@/lib/queryClient";
import { CodePage } from "@/pages/CodePage";
import { DiffCommitPage } from "@/pages/DiffCommitPage";
import { DiffReviewPage } from "@/pages/DiffReviewPage";
import { HomePage } from "@/pages/HomePage";
import { ReposPage } from "@/pages/ReposPage";
import { SetupPage } from "@/pages/SetupPage";
import { PlaybookCreatePage } from "@/pages/PlaybookCreatePage";
import { PlaybookDetailPage } from "@/pages/PlaybookDetailPage";
import { PlaybooksPage } from "@/pages/PlaybooksPage";
import { RackPage } from "@/pages/RackDetailPage";
import { HostPage } from "@/pages/HostPage";
import { GroupsPage } from "@/pages/GroupsPage";
import { GroupDetailPage } from "@/pages/GroupDetailPage";
import { GroupCreatePage } from "@/pages/GroupCreatePage";
import { RackOnboardingPage } from "@/pages/RackOnboardingPage";
import { RacksPage } from "@/pages/RacksPage";
import { HostsPage } from "@/pages/HostsPage";
import { HostCreatePage } from "@/pages/HostCreatePage";
import { RolesPage } from "@/pages/RolesPage";
import { RoleCreatePage } from "@/pages/RoleCreatePage";
import { RoleDetailPage } from "@/pages/RoleDetailPage";
import { RegistryPage } from "@/pages/RegistryPage";
import { RegistryRolePage } from "@/pages/RegistryRolePage";

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
              path="/racks/create"
              element={
                <ProtectedRoute>
                  <OnboardingShell>
                    <RackOnboardingPage />
                  </OnboardingShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/racks/view/:rackId"
              element={
                <ProtectedRoute>
                  <AppShell title="Racks">
                    <RackPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/hosts"
              element={
                <ProtectedRoute>
                  <AppShell title="Hosts">
                    <HostsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/hosts/create"
              element={
                <ProtectedRoute>
                  <OnboardingShell>
                    <HostCreatePage />
                  </OnboardingShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/hosts/:id"
              element={
                <ProtectedRoute>
                  <AppShell title="Hosts">
                    <HostPage />
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
              path="/groups/:groupId"
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
              path="/playbooks"
              element={
                <ProtectedRoute>
                  <AppShell title="Playbooks">
                    <PlaybooksPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/playbooks/create"
              element={
                <ProtectedRoute>
                  <AppShell title="Playbooks">
                    <PlaybookCreatePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/playbooks/:playbookId"
              element={
                <ProtectedRoute>
                  <AppShell title="Playbooks">
                    <PlaybookDetailPage />
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
              path="/roles"
              element={
                <ProtectedRoute>
                  <AppShell title="Roles">
                    <RolesPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/roles/create"
              element={
                <ProtectedRoute>
                  <AppShell title="Create Role">
                    <RoleCreatePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/roles/:slug"
              element={
                <ProtectedRoute>
                  <AppShell title="Roles">
                    <RoleDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/registry"
              element={
                <ProtectedRoute>
                  <AppShell title="Registry">
                    <RegistryPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/registry/:slug"
              element={
                <ProtectedRoute>
                  <AppShell title="Registry">
                    <RegistryRolePage />
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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="lake-admin-theme">
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
