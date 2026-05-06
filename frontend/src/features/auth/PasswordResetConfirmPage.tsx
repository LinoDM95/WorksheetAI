import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import { formatAxiosDrfError } from '../../lib/formatDrfError';
import { Logo } from '../../components/Logo';
import { Alert, Button, Card, Field, TextInput } from '../../components/ui';

const loginDisabled = import.meta.env.VITE_DISABLE_LOGIN === 'true';

export const PasswordResetConfirmPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const linkInvalid = useMemo(() => !uid || !token, [uid, token]);

  useEffect(() => {
    document.title = 'Neues Passwort — WorksheetAI';
    return () => {
      document.title = 'WorksheetAI';
    };
  }, []);

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => navigate('/login', { replace: true }), 2000);
    return () => window.clearTimeout(t);
  }, [done, navigate]);

  if (loginDisabled) return <Navigate to="/app/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError('');
    setFieldErrors({});
    if (password !== passwordConfirm) {
      setFieldErrors({ password_confirm: 'Die Passwörter stimmen nicht überein.' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password-reset/confirm/', {
        uid,
        token,
        password,
        password_confirm: passwordConfirm,
      });
      setDone(true);
    } catch (err: unknown) {
      const { general, fields } = formatAxiosDrfError(err);
      setGeneralError(general);
      setFieldErrors(fields);
      if (!general && Object.keys(fields).length === 0) {
        setGeneralError('Zurücksetzen fehlgeschlagen.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg-app)]">
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-3 py-10 sm:px-4">
        <Card className="w-full !p-6 shadow-lg sm:!p-8">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <h1 className="mb-1 text-center text-xl font-bold tracking-tight text-slate-900">
            Neues Passwort festlegen
          </h1>
          <p className="mb-6 text-center text-sm leading-relaxed text-slate-600">
            Wähle ein neues Passwort für dein Konto.
          </p>

          {linkInvalid ? (
            <Alert tone="error" className="mb-4">
              Der Link ist unvollständig. Bitte verwende den vollständigen Link aus der E-Mail oder
              fordere eine neue an.
            </Alert>
          ) : done ? (
            <Alert tone="success" className="mb-4">
              Dein Passwort wurde geändert. Du wirst gleich zur Anmeldung weitergeleitet …
            </Alert>
          ) : (
            <form className="space-y-3" onSubmit={(ev) => void handleSubmit(ev)} noValidate>
              <Field
                label="Neues Passwort"
                htmlFor="reset-password"
                error={fieldErrors.password}
                help="Mindestens 8 Zeichen; zu einfache Passwörter werden abgelehnt."
              >
                <TextInput
                  id="reset-password"
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
                htmlFor="reset-password2"
                error={fieldErrors.password_confirm}
              >
                <TextInput
                  id="reset-password2"
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
                loading={busy}
                leftIcon={<KeyRound size={15} aria-hidden />}
              >
                Passwort speichern
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <ArrowLeft size={16} aria-hidden />
              Zur Anmeldung
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};
