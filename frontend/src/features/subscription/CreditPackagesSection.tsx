import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Zap } from 'lucide-react';
import { Alert } from '../../components/ui';
import {
  listCreditPackages,
  pricePerThousandCents,
  startCreditCheckout,
  stripeErrorMessage,
  type CreditPackage,
} from '../../lib/stripeBilling';
import { CreditPackageCard } from './CreditPackageCard';

/* ============================================================== *
 * CreditPackagesSection — lädt aktive Pakete vom Backend und
 * zeigt sie als psychologisch optimierte Karten-Reihe.
 *
 * - Berechnet Baseline-Preis (höchster Stückpreis pro 1.000 Credits)
 *   einmal, damit jede Karte ihre Ersparnis konsistent ausweist.
 * - Erweiterbar: neue Pakete via Django-Admin oder Migration —
 *   die UI rendert sie ohne Code-Änderung.
 * ============================================================== */

export const CreditPackagesSection = () => {
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listCreditPackages()
      .then((list) => {
        if (cancelled) return;
        setPackages(list);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(stripeErrorMessage(e, 'Pakete konnten nicht geladen werden.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = useCallback(async (slug: string) => {
    setError(null);
    setLoadingSlug(slug);
    try {
      const url = await startCreditCheckout(slug);
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

  const baselinePricePerK = (packages ?? []).reduce<number>((max, p) => {
    const v = pricePerThousandCents(p.credits, p.price_cents);
    return v > max ? v : max;
  }, 0);

  return (
    <section aria-labelledby="credits-heading" className="space-y-5">
      <header className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-100">
          <Zap size={12} aria-hidden /> Einmalige Aufladung
        </span>
        <h2 id="credits-heading" className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Credits dazu kaufen
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-[14px] text-slate-600">
          Brauchst du gerade mehr? Lade dein Konto sofort auf — keine Wartezeit, keine Bindung. Größere Pakete = besserer Preis.
        </p>
      </header>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loadError ? <Alert tone="warn">{loadError}</Alert> : null}

      {packages === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
          <Loader2 className="animate-spin" size={16} aria-hidden /> Pakete werden geladen…
        </div>
      ) : packages.length === 0 ? (
        <Alert tone="info">Aktuell sind keine Credit-Pakete verfügbar.</Alert>
      ) : (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {packages.map((pkg) => (
            <CreditPackageCard
              key={pkg.slug}
              pkg={pkg}
              baselinePricePerThousandCents={baselinePricePerK}
              loading={loadingSlug === pkg.slug}
              disabled={loadingSlug !== null && loadingSlug !== pkg.slug}
              onSelect={(slug) => void handleSelect(slug)}
            />
          ))}
        </div>
      )}

      <p className="flex items-center justify-center gap-2 text-center text-[12px] text-slate-500">
        <ShieldCheck size={14} aria-hidden className="text-emerald-600" />
        Credits verfallen nicht · Sichere Zahlung über Stripe
      </p>
    </section>
  );
};
