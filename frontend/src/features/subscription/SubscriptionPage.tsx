import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { Alert, Button, Card } from '../../components/ui';
import {
  openStripeCustomerPortal,
  stripeErrorMessage,
} from '../../lib/stripeBilling';
import { CreditPackagesSection } from './CreditPackagesSection';
import { PlansSection } from './PlansSection';

/* ============================================================== *
 * SubscriptionPage — kombiniert Abo-Pläne + Credit-Aufladungen.
 *
 * Eine Seite, zwei Sektionen — über den Anker `#credits` direkt zu
 * den Paketen springen (z. B. via Credits-Bubble in der Topbar).
 * ============================================================== */

export const SubscriptionPage = () => {
  const { user, refreshAuth, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const checkout = searchParams.get('checkout');
  const purchase = searchParams.get('purchase');

  useEffect(() => {
    if (checkout === 'success' || purchase === 'success') {
      void refreshAuth().then(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('checkout');
        next.delete('purchase');
        setSearchParams(next, { replace: true });
      });
    }
  }, [checkout, purchase, refreshAuth, searchParams, setSearchParams]);

  useEffect(() => {
    if (location.hash === '#credits') {
      const el = document.getElementById('credits');
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    }
  }, [location.hash]);

  const handlePortal = useCallback(async () => {
    setPortalError(null);
    setPortalLoading(true);
    try {
      const url = await openStripeCustomerPortal('/app/abonnement');
      if (url) {
        window.location.href = url;
        return;
      }
      setPortalError('Keine Portal-URL erhalten.');
    } catch (e: unknown) {
      setPortalError(stripeErrorMessage(e, 'Kundenportal konnte nicht geöffnet werden.'));
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const hasAccess = user?.has_platform_access === true;
  const currentPlanSlug = user?.subscription?.plan_slug ?? null;
  const currentPlanName = user?.subscription?.plan_name || user?.subscription?.plan_slug || null;
  const currentCredits = user?.credits_balance ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-2 py-4 sm:py-8">
      <header className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-50 to-indigo-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-100">
          <Sparkles size={12} aria-hidden /> Plan & Credits
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Wähle, womit du arbeitest.
        </h1>
        <p className="mx-auto mt-2 text-[14.5px] text-slate-600">
          Monatlicher Plan mit festem Credit-Kontingent — oder spontan einmalig Credits aufladen.
          Alles abrechenbar über Stripe, ohne Risiko.
        </p>
      </header>

      {checkout === 'canceled' ? (
        <Alert tone="warn">Der Checkout wurde abgebrochen. Du kannst es jederzeit erneut versuchen.</Alert>
      ) : null}
      {purchase === 'canceled' ? (
        <Alert tone="warn">Der Credit-Kauf wurde abgebrochen. Kein Geld wurde abgebucht.</Alert>
      ) : null}
      {checkout === 'success' ? (
        <Alert tone="success">Zahlung wird verarbeitet. Dein Konto wird gleich aktualisiert…</Alert>
      ) : null}
      {purchase === 'success' ? (
        <Alert tone="success">
          Aufladung erfolgreich — deine Credits sollten in wenigen Sekunden gutgeschrieben sein.
        </Alert>
      ) : null}

      {hasAccess ? (
        <Card className="!p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Dein aktiver Plan
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">{currentPlanName}</p>
              <p className="mt-1 text-[13px] text-slate-600">
                Aktuelles Guthaben: <span className="font-semibold text-slate-900">{currentCredits.toLocaleString('de-DE')}</span> Credits
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                type="button"
                leftIcon={
                  portalLoading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <CreditCard size={16} aria-hidden />
                }
                loading={portalLoading}
                onClick={() => void handlePortal()}
              >
                Abo verwalten
              </Button>
            </div>
          </div>
          {portalError ? <Alert tone="error" className="mt-4">{portalError}</Alert> : null}
        </Card>
      ) : null}

      <PlansSection
        currentPlanSlug={currentPlanSlug}
        hasActiveSubscription={hasAccess && !!currentPlanSlug && currentPlanSlug !== 'free'}
      />

      <div id="credits" className="scroll-mt-24">
        <CreditPackagesSection />
      </div>

      {!hasAccess ? (
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
      ) : null}
    </div>
  );
};
