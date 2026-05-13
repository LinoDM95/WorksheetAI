import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, KeyRound, Loader2, Mail, UserCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import {
  formatPriceCents,
  openStripeCustomerPortal,
  startStripeCheckout,
  stripeErrorMessage,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanSlug,
} from '../../lib/stripeBilling';
import { Alert, Button, Card, Field, TextInput } from '../../components/ui';

function firstFieldError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  for (const v of Object.values(rec)) {
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  }
  return null;
}

export const SettingsPage = () => {
  const { user, refreshAuth, logout } = useAuth();
  const navigate = useNavigate();
  const bypassPaywall = !!(user?.is_staff || user?.is_superuser);
  const hasAccess = user?.has_platform_access === true;
  const isDemo = user?.is_demo_account === true;

  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const [checkoutSlug, setCheckoutSlug] = useState<SubscriptionPlanSlug | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingErr, setBillingErr] = useState<string | null>(null);

  const [demoNewEmail, setDemoNewEmail] = useState('');
  const [demoNewPw, setDemoNewPw] = useState('');
  const [demoNewPw2, setDemoNewPw2] = useState('');
  const [demoCurPw, setDemoCurPw] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMsg, setDemoMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const submitEmail = useCallback(async () => {
    setEmailMsg(null);
    setEmailLoading(true);
    try {
      await api.post('/auth/email/change/', {
        new_email: email.trim(),
        current_password: emailPassword,
      });
      setEmailMsg({ tone: 'ok', text: 'E-Mail-Adresse wurde aktualisiert.' });
      setEmail('');
      setEmailPassword('');
      await refreshAuth();
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: unknown; status?: number } })?.response;
      const detail =
        firstFieldError(resp?.data) ||
        stripeErrorMessage(e, 'E-Mail konnte nicht geändert werden.');
      setEmailMsg({ tone: 'err', text: detail });
    } finally {
      setEmailLoading(false);
    }
  }, [email, emailPassword, refreshAuth]);

  const submitPassword = useCallback(async () => {
    setPwMsg(null);
    setPwLoading(true);
    try {
      await api.post('/auth/password/change/', {
        current_password: curPw,
        new_password: newPw,
        new_password_confirm: newPw2,
      });
      setPwMsg({
        tone: 'ok',
        text: 'Passwort geändert. Bei der nächsten Anmeldung bitte das neue Passwort nutzen.',
      });
      setCurPw('');
      setNewPw('');
      setNewPw2('');
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: unknown } })?.response;
      const detail =
        firstFieldError(resp?.data) ||
        stripeErrorMessage(e, 'Passwort konnte nicht geändert werden.');
      setPwMsg({ tone: 'err', text: detail });
    } finally {
      setPwLoading(false);
    }
  }, [curPw, newPw, newPw2]);

  const submitFinalizeDemo = useCallback(async () => {
    setDemoMsg(null);
    setDemoLoading(true);
    try {
      await api.post('/auth/demo/finalize/', {
        new_email: demoNewEmail.trim(),
        new_password: demoNewPw,
        new_password_confirm: demoNewPw2,
        current_password: demoCurPw,
      });
      setDemoMsg({
        tone: 'ok',
        text: 'Dein Konto ist jetzt vollständig. Du wirst zur Anmeldung weitergeleitet.',
      });
      await logout();
      navigate('/login?demo=converted', { replace: true });
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: unknown } })?.response;
      const detail =
        firstFieldError(resp?.data) ||
        stripeErrorMessage(e, 'Konto konnte nicht abgeschlossen werden.');
      setDemoMsg({ tone: 'err', text: detail });
    } finally {
      setDemoLoading(false);
    }
  }, [demoNewEmail, demoNewPw, demoNewPw2, demoCurPw, logout, navigate]);

  const onCheckout = useCallback(async (slug: SubscriptionPlanSlug) => {
    setBillingErr(null);
    setCheckoutSlug(slug);
    try {
      const url = await startStripeCheckout(slug);
      if (url) window.location.href = url;
      else setBillingErr('Keine Checkout-URL erhalten.');
    } catch (e: unknown) {
      setBillingErr(stripeErrorMessage(e, 'Checkout konnte nicht gestartet werden.'));
    } finally {
      setCheckoutSlug(null);
    }
  }, []);

  const onPortal = useCallback(async () => {
    setBillingErr(null);
    setPortalLoading(true);
    try {
      const url = await openStripeCustomerPortal('/app/settings');
      if (url) window.location.href = url;
      else setBillingErr('Keine Portal-URL erhalten.');
    } catch (e: unknown) {
      setBillingErr(stripeErrorMessage(e, 'Kundenportal konnte nicht geöffnet werden.'));
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const subscription = user?.subscription;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Konto</h2>
        <p className="mt-1 text-sm text-slate-600">
          Angemeldet als <span className="font-medium text-slate-800">{user?.email}</span>
          {user?.first_name || user?.last_name ? (
            <>
              {' '}
              ({[user.first_name, user.last_name].filter(Boolean).join(' ')})
            </>
          ) : null}
        </p>
        {isDemo ? (
          <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 ring-1 ring-amber-100">
            Demo-Zugang
          </p>
        ) : null}
      </div>

      {isDemo ? (
        <Card className="!p-5 sm:!p-6">
          <div className="mb-4 flex items-center gap-2 text-slate-900">
            <UserCircle size={18} className="text-violet-600" aria-hidden />
            <h3 className="text-[15px] font-bold">Demo-Zugang beenden</h3>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Lege die E-Mail und das Passwort für dein dauerhaftes Konto fest. Deine Arbeitsblätter und Boards bleiben
            erhalten. Anschließend kannst du ein Abo oder Aufladungen wie gewohnt nutzen.
          </p>
          {demoMsg ? (
            <Alert tone={demoMsg.tone === 'ok' ? 'success' : 'error'} className="mb-4">
              {demoMsg.text}
            </Alert>
          ) : null}
          <div className="space-y-4">
            <Field label="Neue E-Mail (Anmeldename)" htmlFor="demo-email" required>
              <TextInput
                id="demo-email"
                type="email"
                autoComplete="email"
                value={demoNewEmail}
                onChange={(e) => setDemoNewEmail(e.target.value)}
                placeholder="deine@adresse.de"
              />
            </Field>
            <Field label="Neues Passwort" htmlFor="demo-np" required>
              <TextInput
                id="demo-np"
                type="password"
                autoComplete="new-password"
                value={demoNewPw}
                onChange={(e) => setDemoNewPw(e.target.value)}
              />
            </Field>
            <Field label="Neues Passwort wiederholen" htmlFor="demo-np2" required>
              <TextInput
                id="demo-np2"
                type="password"
                autoComplete="new-password"
                value={demoNewPw2}
                onChange={(e) => setDemoNewPw2(e.target.value)}
              />
            </Field>
            <Field label="Aktuelles Demo-Passwort" htmlFor="demo-cur" required>
              <TextInput
                id="demo-cur"
                type="password"
                autoComplete="current-password"
                value={demoCurPw}
                onChange={(e) => setDemoCurPw(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={demoLoading}
              disabled={
                !demoNewEmail.trim() || !demoNewPw || demoNewPw !== demoNewPw2 || !demoCurPw
              }
              onClick={() => void submitFinalizeDemo()}
            >
              Konto vervollständigen
            </Button>
          </div>
        </Card>
      ) : null}

      {!isDemo ? (
        <>
      <Card className="!p-5 sm:!p-6">
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <Mail size={18} className="text-violet-600" aria-hidden />
          <h3 className="text-[15px] font-bold">E-Mail-Adresse ändern</h3>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Nach der Änderung meldest du dich künftig mit der neuen Adresse an (Benutzername = E-Mail).
        </p>
        {emailMsg ? (
          <Alert tone={emailMsg.tone === 'ok' ? 'success' : 'error'} className="mb-4">
            {emailMsg.text}
          </Alert>
        ) : null}
        <div className="space-y-4">
          <Field label="Neue E-Mail" htmlFor="set-email" required>
            <TextInput
              id="set-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="neue@adresse.de"
            />
          </Field>
          <Field label="Aktuelles Passwort" htmlFor="set-email-pw" required>
            <TextInput
              id="set-email-pw"
              type="password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={emailLoading}
            disabled={!email.trim() || !emailPassword}
            onClick={() => void submitEmail()}
          >
            E-Mail speichern
          </Button>
        </div>
      </Card>

      <Card className="!p-5 sm:!p-6">
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <KeyRound size={18} className="text-violet-600" aria-hidden />
          <h3 className="text-[15px] font-bold">Passwort ändern</h3>
        </div>
        {pwMsg ? (
          <Alert tone={pwMsg.tone === 'ok' ? 'success' : 'error'} className="mb-4">
            {pwMsg.text}
          </Alert>
        ) : null}
        <div className="space-y-4">
          <Field label="Aktuelles Passwort" htmlFor="pw-cur" required>
            <TextInput
              id="pw-cur"
              type="password"
              autoComplete="current-password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
            />
          </Field>
          <Field label="Neues Passwort" htmlFor="pw-new" required>
            <TextInput
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </Field>
          <Field label="Neues Passwort wiederholen" htmlFor="pw-new2" required>
            <TextInput
              id="pw-new2"
              type="password"
              autoComplete="new-password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={pwLoading}
            disabled={!curPw || !newPw || newPw !== newPw2}
            onClick={() => void submitPassword()}
          >
            Passwort speichern
          </Button>
          <p className="text-xs text-slate-500">
            Passwort vergessen?{' '}
            <Link to="/passwort-vergessen" className="text-violet-700 hover:underline">
              Link zum Zurücksetzen anfordern
            </Link>
          </p>
        </div>
      </Card>
        </>
      ) : null}

      <Card className="!p-5 sm:!p-6">
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <CreditCard size={18} className="text-violet-600" aria-hidden />
          <h3 className="text-[15px] font-bold">Zahlung &amp; Abo</h3>
        </div>
        {billingErr ? (
          <Alert tone="error" className="mb-4">
            {billingErr}
          </Alert>
        ) : null}

        {bypassPaywall ? (
          <p className="text-sm text-slate-600">
            Als Administrator:in ist kein aktives Abo erforderlich. Credits und Kundenportal (falls vorhanden)
            kannst du dennoch wie gewohnt nutzen.
          </p>
        ) : null}

        {isDemo ? (
          <p className="mt-2 text-sm text-slate-600">
            Demo-Konten können hier kein Abo abschließen und keine Zahlungen auslösen. Beende zuerst den Demo-Zugang
            oben und lege E-Mail und Passwort fest — danach stehen dir die üblichen Optionen zur Verfügung.
          </p>
        ) : null}

        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-medium text-slate-900">Credits:</span>{' '}
            {(user?.credits_balance ?? 0).toLocaleString('de-DE')} / Monatsreferenz{' '}
            {(user?.credits_reference_cap ?? 0).toLocaleString('de-DE')}
          </p>
          {hasAccess && subscription && !isDemo ? (
            <p>
              <span className="font-medium text-slate-900">Abo:</span>{' '}
              {subscription.plan_name || subscription.plan_slug} ({subscription.status})
            </p>
          ) : hasAccess && isDemo ? (
            <p className="text-slate-600">
              <span className="font-medium text-slate-900">Zugang:</span> Demo über Credit-Guthaben (kein Abo).
            </p>
          ) : !bypassPaywall && !isDemo ? (
            <p className="text-amber-800">
              Noch kein aktiver Zugang — wähle ein Paket oder öffne die{' '}
              <Link to="/app/abonnement" className="font-medium text-violet-700 hover:underline">
                Abo-Seite
              </Link>
              .
            </p>
          ) : !bypassPaywall && isDemo ? (
            <p className="text-amber-800">
              Kein Zugang mehr — Demo-Guthaben ist aufgebraucht oder der Zugang wurde eingeschränkt. Beende den
              Demo-Zugang oben oder wende dich an den Veranstalter.
            </p>
          ) : null}
        </div>

        {!isDemo ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={
              portalLoading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : undefined
            }
            loading={portalLoading}
            onClick={() => void onPortal()}
          >
            Zahlungsmethoden &amp; Rechnungen (Stripe)
          </Button>
          <Button as="link" variant="ghost" size="sm" to="/app/abonnement" leftIcon={<UserCircle size={16} aria-hidden />}>
            Zur Abo-Übersicht
          </Button>
        </div>
        ) : null}

        {!hasAccess && !bypassPaywall && !isDemo ? (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <p className="mb-4 text-sm font-medium text-slate-800">Paket wählen</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SUBSCRIPTION_PLANS.map((p) => (
                <div
                  key={p.slug}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm"
                >
                  <div className="font-semibold text-slate-900">{p.title}</div>
                  <div className="mt-1 text-violet-700">{formatPriceCents(p.price_cents)} / Monat</div>
                  <div className="mt-1 text-slate-600">{p.credits.toLocaleString('de-DE')} Credits / Monat</div>
                  <Button
                    className="mt-3"
                    variant="primary"
                    size="sm"
                    fullWidth
                    type="button"
                    loading={checkoutSlug === p.slug}
                    onClick={() => void onCheckout(p.slug)}
                  >
                    Jetzt buchen
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <p className="text-center text-xs text-slate-500">
        <button
          type="button"
          className="text-violet-700 hover:underline"
          onClick={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          Abmelden
        </button>
      </p>
    </div>
  );
};
