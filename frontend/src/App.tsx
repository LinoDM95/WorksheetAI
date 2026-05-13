import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/authContext';
import { AiGenerationJobsProvider } from './components/ai-generation/AiGenerationJobsContext';
import { AppShell } from './components/shell/AppShell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { WizardPage } from './features/wizard/WizardPage';
import { WorksheetWorkspacePage, WorksheetEditorPlaceholder, WorksheetPageOutlet } from './features/worksheets/WorksheetWorkspacePage';
import { PatternLibraryPage } from './features/patterns/PatternLibraryPage';
import { CurriculaRoutes } from './features/curricula/CurriculaRoutes';
import { BoardsRoutes } from './features/boards/BoardsRoutes';
import { BoardLibraryWorkspace } from './features/boards/pages/BoardLibraryWorkspace';
import { BoardLibraryCommunityPreviewPage } from './features/boards/pages/BoardLibraryCommunityPreviewPage';
import { WorksheetLibraryCommunityPreviewPage } from './features/worksheets/library/WorksheetLibraryCommunityPreviewPage';
import { BoardLibraryListPage } from './features/boards/pages/BoardLibraryListPage';
import { BoardPlayPage } from './features/boards/pages/BoardPlayPage';
import { StudentBoardPage } from './features/boards/pages/StudentBoardPage';
import { PasswordForgotPage } from './features/auth/PasswordForgotPage';
import { PasswordResetConfirmPage } from './features/auth/PasswordResetConfirmPage';
import { PublicLoginPage } from './features/auth/PublicLoginPage';
import { DatenschutzPage, ImpressumPage } from './features/legal/LegalNoticePages';
import { BackofficePage } from './features/backoffice/BackofficePage';
import { SubscriptionPage } from './features/subscription/SubscriptionPage';
import { CreditsPage } from './features/subscription/CreditsPage';
import { SettingsPage } from './features/settings/SettingsPage';

const loginDisabled = import.meta.env.VITE_DISABLE_LOGIN === 'true';

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

const AuthCurriculumRedirect = () => {
  const { user, bootstrapped } = useAuth();
  if (!bootstrapped) {
    return (
      <div className="grid min-h-[40vh] place-items-center bg-[var(--color-bg-app)] text-slate-500">
        Laden…
      </div>
    );
  }
  if (!user?.is_staff) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <Navigate to="/app/curricula/sources" replace />;
};

const StaffOnlyBackoffice = () => {
  const { user, bootstrapped } = useAuth();
  if (!bootstrapped) {
    return (
      <div className="grid min-h-[40vh] place-items-center bg-[var(--color-bg-app)] text-slate-500">
        Laden…
      </div>
    );
  }
  if (!user?.is_staff) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return (
    <ShellRoute
      topbar={{
        title: 'Backoffice',
        subtitle: 'Bibliotheks-Freigaben',
        breadcrumbs: ['Administration', 'Backoffice'],
      }}
    >
      <BackofficePage />
    </ShellRoute>
  );
};

const StaffOnlyCurricula = () => {
  const { user, bootstrapped } = useAuth();
  if (!bootstrapped) {
    return (
      <div className="grid min-h-[40vh] place-items-center bg-[var(--color-bg-app)] text-slate-500">
        Laden…
      </div>
    );
  }
  if (!user?.is_staff) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return (
    <ShellRoute
      topbar={{
        title: 'Lehrplanverwaltung',
        subtitle: 'Lehrplan-PDFs, Extraktion und Kontexte — nur für Administrator:innen',
        breadcrumbs: ['Administration', 'Lehrpläne'],
      }}
    >
      <CurriculaRoutes />
    </ShellRoute>
  );
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
  const subscriptionPath =
    location.pathname === '/app/abonnement' || location.pathname.startsWith('/app/abonnement/');
  const creditsPath =
    location.pathname === '/app/credits' || location.pathname.startsWith('/app/credits/');
  const settingsPath =
    location.pathname === '/app/settings' || location.pathname.startsWith('/app/settings/');
  const bypassPaywall = user.is_staff || user.is_superuser;
  if (
    !bypassPaywall &&
    user.has_platform_access !== true &&
    !subscriptionPath &&
    !creditsPath &&
    !settingsPath
  ) {
    return <Navigate to="/app/abonnement" replace />;
  }
  return <Outlet />;
};

export default function App() {
  return (
    <AuthProvider>
      <AiGenerationJobsProvider>
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
          path="abonnement"
          element={
            <ShellRoute topbar={{ title: 'Plan & Credits', subtitle: 'Abos und einmalige Aufladungen — alles an einem Ort' }}>
              <SubscriptionPage />
            </ShellRoute>
          }
        />
        <Route
          path="credits"
          element={
            <ShellRoute topbar={{ title: 'Credits aufladen', subtitle: 'Einmalig mehr Credits — sofort verfügbar' }}>
              <CreditsPage />
            </ShellRoute>
          }
        />
        <Route
          path="dashboard"
          element={
            <ShellRoute
              fullBleed
              topbar={{ title: 'Startseite', subtitle: 'Weiter machen, wo du aufgehört hast — und die Bibliothek entdecken' }}
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
          element={<StaffOnlyCurricula />}
        />
        <Route
          path="curriculum"
          element={
            <AuthCurriculumRedirect />
          }
        />
        <Route path="boards/:id/play" element={<BoardPlayPage />} />
        <Route path="boards/library" element={<BoardLibraryWorkspace />}>
          <Route index element={<BoardLibraryListPage />} />
          <Route path="worksheets/:libraryWorksheetId" element={<WorksheetLibraryCommunityPreviewPage />} />
          <Route path=":libraryBoardId" element={<BoardLibraryCommunityPreviewPage />} />
        </Route>
        <Route path="boards/*" element={<BoardWorkspaceShell />} />
        <Route path="library" element={<Navigate to="/app/boards/library" replace />} />
        <Route
          path="settings"
          element={
            <ShellRoute topbar={{ title: 'Einstellungen', subtitle: 'Account übernehmen, Konto, Passwort und Zahlungen' }}>
              <SettingsPage />
            </ShellRoute>
          }
        />
        <Route path="backoffice" element={<StaffOnlyBackoffice />} />
        <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      </AiGenerationJobsProvider>
    </AuthProvider>
  );
}
