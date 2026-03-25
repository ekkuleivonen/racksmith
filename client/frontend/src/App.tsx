import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { OnboardingGuard } from "@/components/onboarding-guard";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/auth-context";
import { queryClient } from "@/lib/queryClient";
import { HomePage } from "@/pages/HomePage";
import { WelcomePage } from "@/pages/WelcomePage";
import { OnboardingPage } from "@/pages/OnboardingPage";

const FilesPage = lazy(() => import("@/pages/FilesPage").then(m => ({ default: m.FilesPage })));
const DiffCommitPage = lazy(() => import("@/pages/DiffCommitPage").then(m => ({ default: m.DiffCommitPage })));
const DiffReviewPage = lazy(() => import("@/pages/DiffReviewPage").then(m => ({ default: m.DiffReviewPage })));
const ReposPage = lazy(() => import("@/pages/ReposPage").then(m => ({ default: m.ReposPage })));
const PlaybookCreatePage = lazy(() => import("@/pages/PlaybookCreatePage").then(m => ({ default: m.PlaybookCreatePage })));
const PlaybookDetailPage = lazy(() => import("@/pages/PlaybookDetailPage").then(m => ({ default: m.PlaybookDetailPage })));
const PlaybooksPage = lazy(() => import("@/pages/PlaybooksPage").then(m => ({ default: m.PlaybooksPage })));
const RackDetailPage = lazy(() => import("@/pages/RackDetailPage").then(m => ({ default: m.RackDetailPage })));
const GroupsPage = lazy(() => import("@/pages/GroupsPage").then(m => ({ default: m.GroupsPage })));
const GroupDetailPage = lazy(() => import("@/pages/GroupDetailPage").then(m => ({ default: m.GroupDetailPage })));
const GroupCreatePage = lazy(() => import("@/pages/GroupCreatePage").then(m => ({ default: m.GroupCreatePage })));
const RackOnboardingPage = lazy(() => import("@/pages/RackOnboardingPage").then(m => ({ default: m.RackOnboardingPage })));
const HostCreatePage = lazy(() => import("@/pages/HostCreatePage").then(m => ({ default: m.HostCreatePage })));
const HostDetailPage = lazy(() => import("@/pages/HostDetailPage").then(m => ({ default: m.HostDetailPage })));
const RolesPage = lazy(() => import("@/pages/RolesPage").then(m => ({ default: m.RolesPage })));
const RoleCreatePage = lazy(() => import("@/pages/RoleCreatePage").then(m => ({ default: m.RoleCreatePage })));
const RoleDetailPage = lazy(() => import("@/pages/RoleDetailPage").then(m => ({ default: m.RoleDetailPage })));
const RegistryPage = lazy(() => import("@/pages/RegistryPage").then(m => ({ default: m.RegistryPage })));
const DiscoveryPage = lazy(() => import("@/pages/DiscoveryPage").then(m => ({ default: m.DiscoveryPage })));
const RegistryRolePage = lazy(() => import("@/pages/RegistryRolePage").then(m => ({ default: m.RegistryRolePage })));
const RegistryPlaybookPage = lazy(() => import("@/pages/RegistryPlaybookPage").then(m => ({ default: m.RegistryPlaybookPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(m => ({ default: m.SettingsPage })));

function ProtectedAppLayout() {
  return (
    <ProtectedRoute>
      <OnboardingGuard>
        <AppShell title="">
          <Outlet />
        </AppShell>
      </OnboardingGuard>
    </ProtectedRoute>
  );
}

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
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden relative">
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
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
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="text-zinc-500 text-sm">Loading...</div>
            </div>
          }>
            <Routes>
              {/* Public */}
              <Route path="/welcome" element={<WelcomePage />} />

              {/* Auth-only (no onboarding guard) */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <OnboardingPage />
                  </ProtectedRoute>
                }
              />

              {/* Auth + onboarding required */}
              <Route element={<ProtectedAppLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/repos" element={<ReposPage />} />
                <Route path="/racks" element={<Navigate to="/?view=rack" replace />} />
                <Route path="/racks/create" element={<RackOnboardingPage />} />
                <Route path="/racks/view/:rackId" element={<RackDetailPage />} />
                <Route path="/hosts/create" element={<HostCreatePage />} />
                <Route path="/hosts" element={<Navigate to="/?view=list" replace />} />
                <Route path="/hosts/:id" element={<HostDetailPage />} />
                <Route path="/groups" element={<GroupsPage />} />
                <Route path="/groups/create" element={<GroupCreatePage />} />
                <Route path="/groups/:groupId" element={<GroupDetailPage />} />
                <Route path="/files/:owner/:repo/*" element={<FilesPage />} />
                <Route path="/files" element={<FilesPage />} />
                <Route path="/playbooks" element={<PlaybooksPage />} />
                <Route path="/playbooks/create" element={<PlaybookCreatePage />} />
                <Route path="/playbooks/:playbookId" element={<PlaybookDetailPage />} />
                <Route path="/diff/review" element={<DiffReviewPage />} />
                <Route path="/diff/commit" element={<DiffCommitPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/roles/create" element={<RoleCreatePage />} />
                <Route path="/roles/:roleId" element={<RoleDetailPage />} />
                <Route path="/registry" element={<RegistryPage />} />
                <Route path="/registry/playbooks/:id" element={<RegistryPlaybookPage />} />
                <Route path="/registry/:id" element={<RegistryRolePage />} />
                <Route path="/discovery" element={<DiscoveryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="racksmith-theme">
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
