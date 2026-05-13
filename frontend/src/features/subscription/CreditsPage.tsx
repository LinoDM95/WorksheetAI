import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { Alert, Button, Card } from '../../components/ui';
import { CreditPackagesSection } from './CreditPackagesSection';

/* ============================================================== *
 * CreditsPage — fokussierte Seite zum Aufladen (ohne Abo-Block).
 *
 * Erreichbar via:
 *  - Klick auf die Credits-Bubble in der Topbar
 *  - Sidebar-Eintrag "Plan & Credits" (auf der kombinierten Seite)
 * ============================================================== */

export const CreditsPage = () => {
  const { user, refreshAuth } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const purchase = searchParams.get('purchase');

  useEffect(() => {
    if (purchase === 'success') {
      void refreshAuth().then(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('purchase');
        setSearchParams(next, { replace: true });
      });
    }
  }, [purchase, refreshAuth, searchParams, setSearchParams]);

  const isDemo = user?.is_demo_account === true;

  if (isDemo) {
    const balance = user?.credits_balance ?? 0;
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6 px-2 py-4 sm:py-8">
        <header className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-100">
            Demo-Konto
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Credit-Aufladung
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Einmalzahlungen sind für Demo-Zugänge deaktiviert. Übernimm dein Konto unter{' '}
            <Link
              to="/app/settings#account-uebernehmen-demo"
              className="font-semibold text-violet-700 hover:underline"
            >
              Einstellungen
            </Link>{' '}
            (Abschnitt „Account übernehmen“).
          </p>
        </header>
        <Card className="!p-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Aktuelles Guthaben</p>
          <p className="mt-2 font-display text-4xl font-bold tabular-nums text-slate-900">
            {balance.toLocaleString('de-DE')}{' '}
            <span className="text-lg font-semibold text-slate-500">Credits</span>
          </p>
        </Card>
      </div>
    );
  }

  const balance = user?.credits_balance ?? 0;
  const monthlyGrant = user?.subscription?.monthly_credit_grant ?? 0;
  const planName = user?.subscription?.plan_name || user?.subscription?.plan_slug || null;
  const hasActivePlan = (user?.has_platform_access === true) && monthlyGrant > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-2 py-4 sm:py-8">
      <header className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-100">
          <Sparkles size={12} aria-hidden /> Credits aufladen
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Mehr Credits — sofort.
        </h1>
        <p className="mx-auto mt-2 text-[14.5px] text-slate-600">
          Einmalige Aufladung neben deinem Abo. Credits verfallen nicht. Größere Pakete sparen.
        </p>
      </header>

      {purchase === 'canceled' ? (
        <Alert tone="warn">Der Credit-Kauf wurde abgebrochen. Kein Geld wurde abgebucht.</Alert>
      ) : null}
      {purchase === 'success' ? (
        <Alert tone="success">
          Aufladung erfolgreich — deine Credits sollten in wenigen Sekunden gutgeschrieben sein.
        </Alert>
      ) : null}

      <Card className="!p-5 sm:!p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Aktuelles Guthaben
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tabular-nums text-slate-900">
                {balance.toLocaleString('de-DE')}
              </span>
              <span className="text-sm font-semibold text-slate-500">Credits</span>
            </p>
            {hasActivePlan ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-emerald-700">
                <TrendingUp size={13} aria-hidden />
                {monthlyGrant.toLocaleString('de-DE')} Credits werden im Plan
                {planName ? ` "${planName}"` : ''} monatlich gutgeschrieben
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-slate-500">
                Noch kein aktives Abo — sichere dir monatlich automatische Credits.
              </p>
            )}
          </div>
          <Button as="link" variant="secondary" to="/app/abonnement">
            Abo-Pläne ansehen
          </Button>
        </div>
      </Card>

      <CreditPackagesSection />
    </div>
  );
};
