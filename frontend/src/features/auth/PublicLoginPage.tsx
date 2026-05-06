import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogIn, UserPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { formatAxiosDrfError } from '../../lib/formatDrfError';
import {
  DEFAULT_AUTH_REDIRECT,
  sanitizeAuthRedirectNext,
} from '../../lib/sanitizeAuthRedirectNext';
import { Logo } from '../../components/Logo';
import { Alert, Button, Card, Field, TextInput } from '../../components/ui';

const loginDisabled = import.meta.env.VITE_DISABLE_LOGIN === 'true';

type Mode = 'login' | 'register';

const fieldLabel = (key: string): string => {
  const map: Record<string, string> = {
    email: 'E-Mail',
    username: 'E-Mail',
    password: 'Passwort',
    first_name: 'Vorname',
    last_name: 'Nachname',
    non_field_errors: 'Formular',
  };
  return map[key] ?? key;
};

export const PublicLoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, bootstrapped, refreshAuth } = useAuth();
  const reduceMotion = useReducedMotion();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const afterAuthTarget = useMemo(() => {
    const raw = searchParams.get('next');
    return sanitizeAuthRedirectNext(raw) ?? DEFAULT_AUTH_REDIRECT;
  }, [searchParams]);

  useEffect(() => {
    document.title = mode === 'login' ? 'Anmelden — WorksheetAI' : 'Registrieren — WorksheetAI';
    return () => {
      document.title = 'WorksheetAI';
    };
  }, [mode]);

  const clearErrors = () => {
    setGeneralError('');
    setFieldErrors({});
  };

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    clearErrors();
    setMode(next);
    setPassword('');
    setPasswordConfirm('');
  };

  if (loginDisabled) return <Navigate to="/app/dashboard" replace />;

  if (!bootstrapped) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[var(--color-bg-app)] text-slate-500">
        Laden…
      </div>
    );
  }

  if (user) return <Navigate to={afterAuthTarget} replace />;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      setGeneralError('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/login/', { username: trimmed, password });
      await refreshAuth();
      navigate(afterAuthTarget, { replace: true });
    } catch (err: unknown) {
      const { general, fields } = formatAxiosDrfError(err);
      setGeneralError(general || 'Anmeldung fehlgeschlagen.');
      setFieldErrors(fields);
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    const trimmedMail = email.trim().toLowerCase();
    if (!trimmedMail || !password) {
      setGeneralError('Bitte E-Mail und Passwort angeben.');
      return;
    }
    if (password !== passwordConfirm) {
      setFieldErrors({ password_confirm: 'Die Passwörter stimmen nicht überein.' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/register/', {
        email: trimmedMail,
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      await api.post('/auth/login/', { username: trimmedMail, password });
      await refreshAuth();
      navigate(afterAuthTarget, { replace: true });
    } catch (err: unknown) {
      const { general, fields } = formatAxiosDrfError(err);
      setGeneralError(general);
      setFieldErrors(fields);
      if (!general && Object.keys(fields).length === 0) {
        setGeneralError('Registrierung fehlgeschlagen.');
      }
    } finally {
      setBusy(false);
    }
  };

  const motionProps = {
    initial: reduceMotion ? false : { opacity: 0, y: 8 },
    animate: reduceMotion ? undefined : { opacity: 1, y: 0 },
    exit: reduceMotion ? undefined : { opacity: 0, y: -6 },
    transition: { duration: reduceMotion ? 0 : 0.18 },
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg-app)]">
      <a
        href="#login-main"
        className="absolute left-[9999px] top-4 z-[100] overflow-hidden whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-md outline-none ring-indigo-400 transition focus:left-4 focus:overflow-visible focus-visible:ring-2"
      >
        Zum Formular springen
      </a>
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-3 py-10 sm:px-4">
        <Card id="login-main" className="w-full !p-6 shadow-lg sm:!p-8" tabIndex={-1}>
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <h1 className="mb-1 text-center text-xl font-bold tracking-tight text-slate-900">
            WorksheetAI
          </h1>
          <p className="mb-6 text-center text-sm leading-relaxed text-slate-600">
            Öffentliche Anmeldung für Lehrer:innen — Arbeitsblätter und Smartboards erstellen und
            verwalten.
          </p>

          <div
            role="tablist"
            aria-label="Anmelden oder registrieren"
            className="mb-6 flex gap-1 rounded-xl border border-slate-200/80 bg-slate-100/90 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              id="tab-login"
              aria-controls="panel-login"
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => handleModeChange('login')}
            >
              <LogIn size={16} aria-hidden />
              Anmelden
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              id="tab-register"
              aria-controls="panel-register"
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => handleModeChange('register')}
            >
              <UserPlus size={16} aria-hidden />
              Registrieren
            </button>
          </div>

          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.div
                key="login"
                role="tabpanel"
                id="panel-login"
                aria-labelledby="tab-login"
                {...motionProps}
              >
                <form className="space-y-3" onSubmit={(ev) => void handleLoginSubmit(ev)} noValidate>
                  <Field
                    label="E-Mail"
                    htmlFor="login-email"
                    error={fieldErrors.email ?? fieldErrors.username}
                  >
                    <TextInput
                      id="login-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      invalid={Boolean(fieldErrors.email ?? fieldErrors.username)}
                      autoCapitalize="none"
                    />
                  </Field>
                  <Field label="Passwort" htmlFor="login-password" error={fieldErrors.password}>
                    <TextInput
                      id="login-password"
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(ev) => setPassword(ev.target.value)}
                      invalid={Boolean(fieldErrors.password)}
                    />
                  </Field>
                  {generalError ? (
                    <Alert tone="error" className="mt-2">
                      {generalError}
                    </Alert>
                  ) : null}
                  <Button
                    type="submit"
                    fullWidth
                    className="mt-4"
                    loading={busy}
                    leftIcon={<LogIn size={15} aria-hidden />}
                  >
                    Anmelden
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="register"
                role="tabpanel"
                id="panel-register"
                aria-labelledby="tab-register"
                {...motionProps}
              >
                <form
                  className="space-y-3"
                  onSubmit={(ev) => void handleRegisterSubmit(ev)}
                  noValidate
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Vorname" htmlFor="reg-first" error={fieldErrors.first_name}>
                      <TextInput
                        id="reg-first"
                        name="given-name"
                        autoComplete="given-name"
                        value={firstName}
                        onChange={(ev) => setFirstName(ev.target.value)}
                        invalid={Boolean(fieldErrors.first_name)}
                      />
                    </Field>
                    <Field label="Nachname" htmlFor="reg-last" error={fieldErrors.last_name}>
                      <TextInput
                        id="reg-last"
                        name="family-name"
                        autoComplete="family-name"
                        value={lastName}
                        onChange={(ev) => setLastName(ev.target.value)}
                        invalid={Boolean(fieldErrors.last_name)}
                      />
                    </Field>
                  </div>
                  <Field label="E-Mail" htmlFor="reg-email" error={fieldErrors.email}>
                    <TextInput
                      id="reg-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      invalid={Boolean(fieldErrors.email)}
                      autoCapitalize="none"
                    />
                  </Field>
                  <Field
                    label="Passwort"
                    htmlFor="reg-password"
                    error={fieldErrors.password}
                    help="Mindestens 8 Zeichen; zu einfache Passwörter werden abgelehnt."
                  >
                    <TextInput
                      id="reg-password"
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(ev) => setPassword(ev.target.value)}
                      invalid={Boolean(fieldErrors.password)}
                    />
                  </Field>
                  <Field
                    label="Passwort wiederholen"
                    htmlFor="reg-password2"
                    error={fieldErrors.password_confirm}
                  >
                    <TextInput
                      id="reg-password2"
                      type="password"
                      name="password-confirm"
                      autoComplete="new-password"
                      required
                      value={passwordConfirm}
                      onChange={(ev) => setPasswordConfirm(ev.target.value)}
                      invalid={Boolean(fieldErrors.password_confirm)}
                    />
                  </Field>
                  {generalError ? (
                    <Alert tone="error" className="mt-2">
                      {generalError}
                    </Alert>
                  ) : null}
                  <Button
                    type="submit"
                    fullWidth
                    className="mt-4"
                    variant="secondary"
                    loading={busy}
                    leftIcon={<UserPlus size={15} aria-hidden />}
                  >
                    Konto erstellen und anmelden
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {Object.keys(fieldErrors).some((k) => !['email', 'username', 'password', 'password_confirm', 'first_name', 'last_name'].includes(k)) ? (
            <Alert tone="warn" className="mt-4">
              <ul className="list-inside list-disc space-y-1">
                {Object.entries(fieldErrors)
                  .filter(
                    ([k]) =>
                      ![
                        'email',
                        'username',
                        'password',
                        'password_confirm',
                        'first_name',
                        'last_name',
                      ].includes(k),
                  )
                  .map(([key, msg]) => (
                    <li key={key}>
                      <span className="font-medium">{fieldLabel(key)}:</span> {msg}
                    </li>
                  ))}
              </ul>
            </Alert>
          ) : null}
        </Card>
        <p className="mt-6 text-center text-[12px] leading-relaxed text-slate-500">
          Nach erfolgreicher Anmeldung werden Sitzungs-Cookies gesetzt (
          <span className="whitespace-nowrap">HttpOnly</span>, für diese Domain). Abmelden über das
          Kontomenü oder den Button in der Kopfzeile.
        </p>
      </div>
    </div>
  );
};
