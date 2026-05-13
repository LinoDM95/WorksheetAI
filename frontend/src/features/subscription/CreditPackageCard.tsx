import { Loader2, Zap } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { cn } from '../../lib/cn';
import {
  formatPriceCents,
  pricePerThousandCents,
  type CreditPackage,
} from '../../lib/stripeBilling';

/* ============================================================== *
 * CreditPackageCard — eine einmalige Credit-Aufladung als Karte.
 *
 * Conversion-Trigger:
 * - Hervorgehobenes Paket bekommt Gradient + Badge.
 * - Pro-1.000-Credits-Vergleich + Ersparnis-Prozent.
 * - Klare CTA "Jetzt aufladen".
 * - Knappes Visual ohne Ablenkung (kein Feature-Detail).
 * ============================================================== */

export type CreditPackageCardProps = {
  pkg: CreditPackage;
  /** Bester (niedrigster) Stückpreis pro 1.000 Credits aus allen Paketen — als Basis für Ersparnis. */
  baselinePricePerThousandCents: number;
  loading?: boolean;
  disabled?: boolean;
  onSelect: (slug: string) => void;
};

export const CreditPackageCard = ({
  pkg,
  baselinePricePerThousandCents,
  loading = false,
  disabled = false,
  onSelect,
}: CreditPackageCardProps) => {
  const pricePerK = pricePerThousandCents(pkg.credits, pkg.price_cents);
  const showSavings =
    baselinePricePerThousandCents > 0 && pricePerK < baselinePricePerThousandCents;
  const savings = showSavings
    ? Math.round(((baselinePricePerThousandCents - pricePerK) / baselinePricePerThousandCents) * 100)
    : 0;

  return (
    <div className={cn('relative h-full', pkg.highlighted && 'sm:-translate-y-1')}>
      {pkg.highlighted ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-[1px] rounded-[18px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 opacity-90 blur-[2px]"
        />
      ) : null}
      <Card
        className={cn(
          'relative flex h-full flex-col !p-0',
          pkg.highlighted
            ? 'border-transparent shadow-[0_20px_50px_-20px_rgba(245,158,11,0.45)]'
            : 'border-slate-200',
        )}
      >
        <div
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-[3px] rounded-t-[14px]',
            pkg.highlighted
              ? 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400'
              : 'bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100',
          )}
        />

        {pkg.badge_label ? (
          <span
            className={cn(
              'absolute right-4 top-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              pkg.highlighted
                ? 'bg-gradient-to-r from-amber-500 to-fuchsia-600 text-white shadow-[0_4px_12px_-4px_rgba(245,158,11,0.6)]'
                : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
            )}
          >
            <Zap size={10} aria-hidden />
            {pkg.badge_label}
          </span>
        ) : null}

        <div className="flex flex-1 flex-col p-5">
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-slate-500">
              {pkg.name}
            </p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span
                className={cn(
                  'font-display text-4xl font-bold leading-none tracking-tight tabular-nums',
                  pkg.highlighted
                    ? 'bg-gradient-to-br from-amber-600 via-fuchsia-600 to-violet-700 bg-clip-text text-transparent'
                    : 'text-slate-900',
                )}
              >
                {pkg.credits.toLocaleString('de-DE')}
              </span>
              <span className="text-sm font-semibold text-slate-500">Credits</span>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {formatPriceCents(pkg.price_cents, pkg.currency)}
            </span>
            <span className="text-[12px] text-slate-500">einmalig</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-500">
            <span className="tabular-nums">
              {formatPriceCents(pricePerK, pkg.currency)} / 1.000
            </span>
            {showSavings ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                Du sparst {savings}&nbsp;%
              </span>
            ) : null}
          </div>

          <div className="mt-5">
            <Button
              type="button"
              fullWidth
              variant={pkg.highlighted ? 'primary' : 'secondary'}
              disabled={disabled}
              loading={loading}
              leftIcon={loading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : undefined}
              onClick={() => onSelect(pkg.slug)}
              className={cn(
                pkg.highlighted &&
                  '!bg-gradient-to-r !from-amber-500 !to-fuchsia-600 hover:!from-amber-600 hover:!to-fuchsia-700',
              )}
            >
              Jetzt aufladen
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
