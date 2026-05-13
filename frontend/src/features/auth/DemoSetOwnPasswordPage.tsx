import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { formatAxiosDrfError } from '../../lib/formatDrfError';
import { Logo } from '../../components/Logo';
import { Alert, Button, Card, Field, TextInput } from '../../components/ui';

/** Pflicht-Schritt nach Demo-Login mit Gemeinschaftspasswort — Konto bleibt Demo. */
export const DemoSetOwnPasswordPage = () => {
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = 'Eigenes Passwort — Demo-Zugang';
    return () => {
      document.title = 'WorksheetAI';
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError('');
    setFieldErrors({});
    setBusy(true);
    try {
      await api.post('/auth/demo/set-own-password/', {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      await refreshAuth();
      navigate('/app/dashboard', { replace: true });
    } catch (err: unknown) {
      const { general, fields } = formatAxiosDrfError(err);
      setGeneralError(general || 'Speichern fehlgeschlagen.');
      setFieldErrors(fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-3 py-10 sm:px-4">
      <Card className="w-full !p-6 shadow-lg sm:!p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="mb-5 flex justify-center text-violet-600">
          <KeyRound size={40} aria-hidden />
        </div>
        <h1 className="mb-2 text-center text-xl font-bold tracking-tight text-slate-900">
          Eigenes Passwort festlegen
        </h1>
        <p className="mb-6 text-center text-sm leading-relaxed text-slate-600">
          Du nutzt noch das gemeinsame Demo-Passwort. Bitte lege jetzt ein persönliches Passwort fest — dein
          Zugang bleibt ein Demo-Zugang mit Credits, bis du unter Einstellungen dein Konto übernimmst.
        </p>
        {generalError ? (
          <Alert tone="error" className="mb-4">
            {generalError}
          </Alert>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Bisheriges Demo-Passwort" error={fieldErrors.current_password}>
            <TextInput
              id="demo-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(ev) => setCurrentPassword(ev.target.value)}
              required
              aria-required
            />
          </Field>
          <Field label="Neues Passwort" error={fieldErrors.new_password}>
            <TextInput
              id="demo-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(ev) => setNewPassword(ev.target.value)}
              required
              aria-required
            />
          </Field>
          <Field label="Neues Passwort wiederholen" error={fieldErrors.new_password_confirm}>
            <TextInput
              id="demo-new-password-confirm"
              type="password"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(ev) => setNewPasswordConfirm(ev.target.value)}
              required
              aria-required
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy}>
            Speichern und weiter
          </Button>
        </form>
      </Card>
    </div>
  );
};
