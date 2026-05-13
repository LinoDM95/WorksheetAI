import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { formatAxiosDrfError } from '../../lib/formatDrfError';
import { Alert, Button, Card, Field, TextInput } from '../../components/ui';

export const DemoSetOwnPasswordPage = () => {
  const { user, refreshAuth, logout, bootstrapped } = useAuth();
  const navigate = useNavigate();

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setGeneralError('');
      setFieldErrors({});
      setLoading(true);
      try {
        await api.post('/auth/demo/set-own-password/', {
          current_password: curPw,
          new_password: newPw,
          new_password_confirm: newPw2,
        });
        await refreshAuth();
        navigate('/app/dashboard', { replace: true });
      } catch (err: unknown) {
        const { general, fields } = formatAxiosDrfError(err);
        setGeneralError(general || 'Passwort konnte nicht gespeichert werden.');
        setFieldErrors(fields);
      } finally {
        setLoading(false);
      }
    },
    [curPw, newPw, newPw2, navigate, refreshAuth],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  if (!bootstrapped) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[var(--color-bg-app)] text-slate-500">
        Laden…
      </div>
    );
  }

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  if (!user.demo_must_set_own_password) {
    navigate('/app/dashboard', { replace: true });
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--color-bg-app)] px-4 py-10">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">Eigenes Demo-Passwort setzen</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            Dein Zugriff nutzt noch das gemeinsame Demo-Passwort. Bitte wähle jetzt ein persönliches
            Passwort — danach kannst du wie gewohnt arbeiten („Demo beenden“ bleibt in den
            Einstellungen möglich).
          </p>
        </div>
        <Card>
          <form className="space-y-4" onSubmit={submit} noValidate>
            <Field
              label="Aktuelles (Demo-)Passwort"
              htmlFor="demo-own-cur"
              required
              error={fieldErrors.current_password}
            >
              <TextInput
                id="demo-own-cur"
                type="password"
                autoComplete="current-password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                invalid={Boolean(fieldErrors.current_password)}
                required
              />
            </Field>
            <Field
              label="Neues Passwort"
              htmlFor="demo-own-n1"
              required
              error={fieldErrors.new_password}
            >
              <TextInput
                id="demo-own-n1"
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                invalid={Boolean(fieldErrors.new_password)}
                required
              />
            </Field>
            <Field
              label="Neues Passwort (Wiederholung)"
              htmlFor="demo-own-n2"
              required
              error={fieldErrors.new_password_confirm}
            >
              <TextInput
                id="demo-own-n2"
                type="password"
                autoComplete="new-password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
                invalid={Boolean(fieldErrors.new_password_confirm)}
                required
              />
            </Field>
            {generalError ? <Alert tone="error">{generalError}</Alert> : null}
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Passwort übernehmen
            </Button>
          </form>
        </Card>
        <Button
          type="button"
          variant="ghost"
          className="mx-auto flex w-full items-center justify-center gap-2"
          onClick={handleLogout}
        >
          <LogOut size={16} aria-hidden />
          Abmelden
        </Button>
      </div>
    </div>
  );
};
