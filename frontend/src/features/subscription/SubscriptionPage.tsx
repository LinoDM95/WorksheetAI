import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { Button, Card } from '../../components/ui';
import {
  openStripeCustomerPortal,
  startStripeCheckout,
  stripeErrorMessage,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanSlug,
} from '../../lib/stripeBilling';

export const SubscriptionPage = () => {
  const { user, refreshAuth, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingSlug, setLoadingSlug] = useState<SubscriptionPlanSlug | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = searchParams.get('checkout');

  useEffect(() => {
    if (checkout === 'success') {
      void refreshAuth().then(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('checkout');
        setSearchParams(next, { replace: true });
      });
    }
  }, [checkout, refreshAuth, searchParams, setSearchParams]);

  const startCheckout = useCallback(async (plan_slug: SubscriptionPlanSlug) => {
    setError(null);
    setLoadingSlug(plan_slug);
    try {
      const url = await startStripeCheckout(plan_slug);
      if (url) {
        window.location.href = url;
        return;
      }
      setError('Keine Checkout-URL erhalten.');
    } catch (e: unknown) {
      setError(stripeErrorMessage(e, 'Checkout konnte nicht gestartet werden.'));
    } finally {
      setLoadingSlug(null);
    }
  }, []);

  const portal = useCallback(async () => {
    setError(null);
    setPortalLoading(true);
    try {
      const url = await openStripeCustomerPortal('/app/abonnement');
      if (url) {
        window.location.href = url;
        return;
      }
      setError('Keine Portal-URL erhalten.');
    } catch (e: unknown) {
      setError(stripeErrorMessage(e, 'Kundenportal konnte nicht geöffnet werden.'));
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const hasAccess = user?.has_platform_access === true;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Abonnement</h1>
        <p className="mt-2 text-sm text-slate-600">
          Mit einem aktiven Abo nutzt du Arbeitsblätter, Smartboards und KI-Funktionen. Preise inkl. MwSt.,
          sofern in Stripe entsprechend hinterlegt.
        </p>
      </div>

      {checkout === 'canceled' && (
        <Card className="border-amber-200 bg-amber-50/80 !p-4 text-sm text-amber-900">
          Der Checkout wurde abgebrochen. Du kannst es jederzeit erneut versuchen.
        </Card>
      )}

      {checkout === 'success' && (
        <Card className="border-emerald-200 bg-emerald-50/80 !p-4 text-sm text-emerald-900">
          Zahlung wird verarbeitet. Dein Konto wird gleich aktualisiert…
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50/80 !p-4 text-sm text-red-900">{error}</Card>
      )}

      {hasAccess ? (
        <Card className="!p-6">
          <p className="text-slate-700">
            Dein Abo ist aktiv ({user?.subscription?.plan_name || user?.subscription?.plan_slug || 'bezahlt'}
            ). Du kannst die Plattform normal nutzen.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button as="link" variant="primary" to="/app/dashboard">
              Zum Dashboard
            </Button>
            <Button
              variant="secondary"
              type="button"
              leftIcon={
                portalLoading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <CreditCard size={16} aria-hidden />
              }
              loading={portalLoading}
              onClick={() => void portal()}
            >
              Abo verwalten
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {SUBSCRIPTION_PLANS.map((p) => (
            <Card key={p.slug} className="!p-6">
              <h2 className="text-lg font-semibold text-slate-900">{p.title}</h2>
              <p className="mt-1 text-2xl font-bold text-violet-700">{p.price}</p>
              <p className="mt-2 text-sm text-slate-600">
                {p.credits.toLocaleString('de-DE')} Credits pro Monat auf dein Konto
              </p>
              <Button
                className="mt-6"
                variant="primary"
                fullWidth
                type="button"
                loading={loadingSlug === p.slug}
                leftIcon={loadingSlug === p.slug ? <Loader2 className="animate-spin" size={16} aria-hidden /> : undefined}
                onClick={() => void startCheckout(p.slug)}
              >
                Jetzt buchen
              </Button>
            </Card>
          ))}
        </div>
      )}

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
