import { useCallback, useState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { Alert } from '../../components/ui';
import {
  pricePerThousandCents,
  startStripeCheckout,
  stripeErrorMessage,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanSlug,
} from '../../lib/stripeBilling';
import { PlanCard } from './PlanCard';

/* ============================================================== *
 * PlansSection — drei Abo-Stufen mit Stripe-Checkout.
 *
 * Liest die zentrale `SUBSCRIPTION_PLANS`-Liste, sodass neue Pläne
 * nur dort eingetragen werden müssen (DRY/Erweiterbarkeit).
 * ============================================================== */

export type PlansSectionProps = {
  currentPlanSlug?: string | null;
  /** True, wenn der Nutzer ein aktives bezahltes Abo hat (für UI-Sperre). */
  hasActiveSubscription?: boolean;
};

export const PlansSection = ({ currentPlanSlug, hasActiveSubscription = false }: PlansSectionProps) => {
  const [loadingSlug, setLoadingSlug] = useState<SubscriptionPlanSlug | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baselinePricePerK = SUBSCRIPTION_PLANS.reduce<number>((max, p) => {
    const v = pricePerThousandCents(p.credits, p.price_cents);
    return v > max ? v : max;
  }, 0);

  const handleSelect = useCallback(async (slug: SubscriptionPlanSlug) => {
    setError(null);
    setLoadingSlug(slug);
    try {
      const url = await startStripeCheckout(slug);
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

  return (
    <section aria-labelledby="plans-heading" className="space-y-5">
      <header className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-100">
          <Sparkles size={12} aria-hidden /> Monatliche Pläne
        </span>
        <h2 id="plans-heading" className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Wähle deinen Plan
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-[14px] text-slate-600">
          Volle Plattform-Nutzung mit monatlichem Credit-Kontingent. Jederzeit kündbar — kein Risiko.
        </p>
      </header>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <PlanCard
            key={plan.slug}
            plan={plan}
            baselinePricePerThousandCents={baselinePricePerK}
            loading={loadingSlug === plan.slug}
            disabled={loadingSlug !== null && loadingSlug !== plan.slug}
            isCurrent={hasActiveSubscription && currentPlanSlug === plan.slug}
            onSelect={(slug) => void handleSelect(slug)}
          />
        ))}
      </div>

      <p className="flex items-center justify-center gap-2 text-center text-[12px] text-slate-500">
        <ShieldCheck size={14} aria-hidden className="text-emerald-600" />
        Sichere Zahlung über Stripe · SEPA, Kreditkarte, Apple/Google Pay
      </p>
    </section>
  );
};
