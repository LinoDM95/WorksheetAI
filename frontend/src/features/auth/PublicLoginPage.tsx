import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn } from 'lucide-react';
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  /** Registrierungs-UI ist deaktiviert; Platzhalter-Zustände für die erhaltene Submit-Logik. */
  const [firstName] = useState('');
  const [lastName] = useState('');
  const [passwordConfirm] = useState('');

  const afterAuthTarget = useMemo(() => {
    const raw = searchParams.get('next');
    return sanitizeAuthRedirectNext(raw) ?? DEFAULT_AUTH_REDIRECT;
  }, [searchParams]);

  useEffect(() => {
    document.title = 'Anmelden — WorksheetAI';
    return () => {
      document.title = 'WorksheetAI';
    };
  }, []);

  const clearErrors = () => {
    setGeneralError('');
    setFieldErrors({});
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

  /** Erhalten für spätere Freigabe der Registrierung (derzeit keine UI). */
  const preservedPublicRegisterSubmit = async (e: React.FormEvent) => {
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

  void preservedPublicRegisterSubmit;

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
            <div className="flex justify-end pt-0.5">
              <Link
                to="/passwort-vergessen"
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Passwort vergessen?
              </Link>
            </div>
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
        <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-500">
          <Link to="/impressum" className="font-medium text-slate-600 hover:text-slate-800">
            Impressum
          </Link>
          <span className="px-2 text-slate-300" aria-hidden>
            ·
          </span>
          <Link to="/datenschutz" className="font-medium text-slate-600 hover:text-slate-800">
            Datenschutz
          </Link>
        </p>
      </div>
    </div>
  );
};
