import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { api } from '../../lib/api';
import { formatAxiosDrfError } from '../../lib/formatDrfError';
import { Logo } from '../../components/Logo';
import { Alert, Button, Card, Field, TextInput } from '../../components/ui';

const loginDisabled = import.meta.env.VITE_DISABLE_LOGIN === 'true';

export const PasswordForgotPage = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [generalError, setGeneralError] = useState('');

  useEffect(() => {
    document.title = 'Passwort vergessen — WorksheetAI';
    return () => {
      document.title = 'WorksheetAI';
    };
  }, []);

  if (loginDisabled) return <Navigate to="/app/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setGeneralError('Bitte gib deine E-Mail-Adresse ein.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password-reset/', { email: trimmed });
      setDone(true);
    } catch (err: unknown) {
      const { general } = formatAxiosDrfError(err);
      setGeneralError(general || 'Anfrage fehlgeschlagen.');
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
            Passwort vergessen
          </h1>
          <p className="mb-6 text-center text-sm leading-relaxed text-slate-600">
            Wir senden dir einen sicheren Link zum Zurücksetzen, wenn ein Konto zu dieser
            E-Mail-Adresse existiert.
          </p>

          {done ? (
            <Alert tone="success" className="mb-4">
              Wenn ein Konto mit dieser E-Mail existiert, ist eine Nachricht unterwegs. Bitte
              prüfe auch den Spam-Ordner.
            </Alert>
          ) : (
            <form className="space-y-3" onSubmit={(ev) => void handleSubmit(ev)} noValidate>
              <Field label="E-Mail" htmlFor="forgot-email">
                <TextInput
                  id="forgot-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  autoCapitalize="none"
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
                leftIcon={<Mail size={15} aria-hidden />}
              >
                Link anfordern
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
