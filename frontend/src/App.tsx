import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Construction, LogIn } from 'lucide-react';
import { api } from './lib/api';
import { AppShell } from './components/shell/AppShell';
import { Logo } from './components/Logo';
import { MockBadge } from './components/MockBadge';
import { Alert, Button, Card, Field, TextInput } from './components/ui';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { WizardPage } from './features/wizard/WizardPage';
import { WorksheetWorkspacePage, WorksheetEditorPlaceholder, WorksheetPageOutlet } from './features/worksheets/WorksheetWorkspacePage';
import { PatternLibraryPage } from './features/patterns/PatternLibraryPage';
import { CurriculaRoutes } from './features/curricula/CurriculaRoutes';
import { BoardsRoutes } from './features/boards/BoardsRoutes';
import { BoardPlayPage } from './features/boards/pages/BoardPlayPage';
import { StudentBoardPage } from './features/boards/pages/StudentBoardPage';

const loginDisabled = import.meta.env.VITE_DISABLE_LOGIN === 'true';

/* ------------------------- Login ------------------------- */
function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('DemoPass123!');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (mode: 'login' | 'register') => {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.post('/auth/register/', {
          email,
          password,
          first_name: 'Demo',
          last_name: 'Teacher',
        });
      }
      const r = await api.post('/auth/login/', { username: email, password });
      localStorage.setItem('access', r.data.access);
      localStorage.setItem('refresh', r.data.refresh);
      navigate('/app/dashboard');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: unknown }; message?: string }).response?.data;
      setErr(typeof msg === 'string' ? msg : JSON.stringify(msg ?? (e as Error).message ?? 'Login fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-bg-app)] p-4">
      <Card className="w-full max-w-md !p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="mb-1 text-center text-xl font-bold text-slate-900">Anmelden</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          KI-gestützte Arbeitsblätter für Lehrer:innen
        </p>
        <Field label="E-Mail" htmlFor="login-email" className="mb-3">
          <TextInput
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Passwort" htmlFor="login-pw" className="mb-4">
          <TextInput
            id="login-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            fullWidth
            className="!flex-1"
            onClick={() => void submit('login')}
            disabled={busy}
            leftIcon={<LogIn size={15} aria-hidden />}
          >
            Login
          </Button>
          <Button
            variant="secondary"
            fullWidth
            className="!flex-1"
            onClick={() => void submit('register')}
            disabled={busy}
          >
            Registrieren
          </Button>
        </div>
        {err && (
          <Alert tone="error" className="mt-3">
            {err}
          </Alert>
        )}
      </Card>
    </div>
  );
}

/* ------------------------- Generic Coming-Soon ------------------------- */
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
      subtitle: 'Ordner und Tafelbilder links — Bearbeitung in der Mitte, Werkzeuge in der Kopfzeile',
    }}
  >
    <BoardsRoutes />
  </ShellRoute>
);

/* ------------------------- App ------------------------- */
const Protected = ({ children }: { children: React.ReactNode }) => {
  if (loginDisabled) return <>{children}</>;
  return localStorage.getItem('access') ? <>{children}</> : <Navigate to="/login" replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route
      path="dashboard"
      element={
        <ShellRoute topbar={{ title: 'Dashboard', subtitle: 'KI-gestützte Arbeitsblätter — übersichtlich verwaltet' }}>
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
    <Route path="boards/*" element={<BoardWorkspaceShell />} />
    <Route
      path="library"
      element={<Navigate to="/app/boards/library" replace />}
    />
    <Route
      path="settings"
      element={
        <ShellRoute topbar={{ title: 'Einstellungen' }}>
          <ComingSoon title="Einstellungen" />
        </ShellRoute>
      }
    />
    <Route path="*" element={<Navigate to="dashboard" replace />} />
  </Routes>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/s/:token" element={<StudentBoardPage />} />
      <Route
        path="/app/*"
        element={
          <Protected>
            <AppRoutes />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
