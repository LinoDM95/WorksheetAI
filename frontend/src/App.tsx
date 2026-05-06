import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/authContext';
import { AppShell } from './components/shell/AppShell';
import { MockBadge } from './components/MockBadge';
import { Card } from './components/ui';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { WizardPage } from './features/wizard/WizardPage';
import { WorksheetWorkspacePage, WorksheetEditorPlaceholder, WorksheetPageOutlet } from './features/worksheets/WorksheetWorkspacePage';
import { PatternLibraryPage } from './features/patterns/PatternLibraryPage';
import { CurriculaRoutes } from './features/curricula/CurriculaRoutes';
import { BoardsRoutes } from './features/boards/BoardsRoutes';
import { BoardLibraryWorkspace } from './features/boards/pages/BoardLibraryWorkspace';
import { BoardLibraryCommunityPreviewPage } from './features/boards/pages/BoardLibraryCommunityPreviewPage';
import { BoardLibraryListPage } from './features/boards/pages/BoardLibraryListPage';
import { BoardPlayPage } from './features/boards/pages/BoardPlayPage';
import { StudentBoardPage } from './features/boards/pages/StudentBoardPage';
import { PasswordForgotPage } from './features/auth/PasswordForgotPage';
import { PasswordResetConfirmPage } from './features/auth/PasswordResetConfirmPage';
import { PublicLoginPage } from './features/auth/PublicLoginPage';
import { DatenschutzPage, ImpressumPage } from './features/legal/LegalNoticePages';

const loginDisabled = import.meta.env.VITE_DISABLE_LOGIN === 'true';

const ComingSoon = ({ title }: { title: string }) => (
  <div className="mx-auto w-full max-w-3xl">
    <MockBadge className="mb-4" />
    <Card className="!p-8 text-center">
      <Construction size={36} className="mx-auto mb-3 text-amber-500" aria-hidden />
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        Diese Ansicht ist Teil des Designs, hat aber noch kein Backend. Sobald die nötigen
        Endpunkte existieren, wird hier die echte Funktion ergänzt.
      </p>
    </Card>
  </div>
);

/* ------------------------- Wrapper-Helper ------------------------- */
const ShellRoute = ({
  topbar,
  fullBleed,
  layoutVariant,
  children,
}: {
  topbar?: Parameters<typeof AppShell>[0]['topbar'];
  fullBleed?: boolean;
  layoutVariant?: 'default' | 'focus';
  children: React.ReactNode;
}) => (
  <AppShell topbar={topbar} fullBleed={fullBleed} layoutVariant={layoutVariant}>
    {children}
  </AppShell>
);

const WorksheetWorkspaceShell = () => (
  <ShellRoute
    fullBleed
    layoutVariant="focus"
    topbar={{
      title: 'Meine Arbeitsblätter',
      subtitle: 'Links Ordner durchsuchen — rechts Blatt bearbeiten (Galerie gleich wie Smartboard)',
    }}
  >
    <WorksheetWorkspacePage />
  </ShellRoute>
);

const BoardWorkspaceShell = () => (
  <ShellRoute
    fullBleed
    layoutVariant="focus"
    topbar={{
      title: 'Smartboard',
      subtitle: 'Ordner und Boards links — Bearbeitung in der Mitte, Werkzeuge in der Kopfzeile',
    }}
  >
    <BoardsRoutes />
  </ShellRoute>
);

/* ------------------------- App ------------------------- */
const AuthRootRedirect = () => {
  const { user, bootstrapped } = useAuth();
  if (loginDisabled) return <Navigate to="/app/dashboard" replace />;
  if (!bootstrapped) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[var(--color-bg-app)] text-slate-500">
        Laden…
      </div>
    );
  }
  if (user) return <Navigate to="/app/dashboard" replace />;
  return <Navigate to="/login" replace />;
};

const ProtectedAppLayout = () => {
  const { bootstrapped, user } = useAuth();
  const location = useLocation();
  if (loginDisabled) return <Outlet />;
  if (!bootstrapped) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[var(--color-bg-app)] text-slate-500">
        Laden…
      </div>
    );
  }
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
};

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<AuthRootRedirect />} />
        <Route path="/login" element={<PublicLoginPage />} />
        <Route path="/passwort-vergessen" element={<PasswordForgotPage />} />
        <Route path="/passwort/zuruecksetzen" element={<PasswordResetConfirmPage />} />
        <Route path="/impressum" element={<ImpressumPage />} />
        <Route path="/datenschutz" element={<DatenschutzPage />} />
        <Route path="/s/:token" element={<StudentBoardPage />} />
        <Route path="/app" element={<ProtectedAppLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <ShellRoute
              fullBleed
              topbar={{ title: 'Dashboard', subtitle: 'KI-gestützte Arbeitsblätter — übersichtlich verwaltet' }}
            >
              <DashboardPage />
            </ShellRoute>
          }
        />
        <Route
          path="create"
          element={
            <ShellRoute fullBleed topbar={{ title: 'Neues Arbeitsblatt', breadcrumbs: ['Dashboard', 'Neues Blatt'] }}>
              <WizardPage />
            </ShellRoute>
          }
        />
        <Route path="worksheets" element={<WorksheetWorkspaceShell />}>
          <Route index element={<WorksheetEditorPlaceholder />} />
          <Route path=":id" element={<WorksheetPageOutlet />} />
        </Route>
        <Route
          path="patterns"
          element={
            <ShellRoute topbar={{ title: 'Vorlagen' }}>
              <PatternLibraryPage />
            </ShellRoute>
          }
        />
        <Route
          path="curricula/*"
          element={
            <ShellRoute topbar={{ title: 'Lehrplanverwaltung', breadcrumbs: ['Dashboard', 'Lehrpläne'] }}>
              <CurriculaRoutes />
            </ShellRoute>
          }
        />
        <Route path="curriculum" element={<Navigate to="/app/curricula/sources" replace />} />
        <Route path="boards/:id/play" element={<BoardPlayPage />} />
        <Route path="boards/library" element={<BoardLibraryWorkspace />}>
          <Route index element={<BoardLibraryListPage />} />
          <Route path=":libraryBoardId" element={<BoardLibraryCommunityPreviewPage />} />
        </Route>
        <Route path="boards/*" element={<BoardWorkspaceShell />} />
        <Route path="library" element={<Navigate to="/app/boards/library" replace />} />
        <Route
          path="settings"
          element={
            <ShellRoute topbar={{ title: 'Einstellungen' }}>
              <ComingSoon title="Einstellungen" />
            </ShellRoute>
          }
        />
        <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </AuthProvider>
  );
}
