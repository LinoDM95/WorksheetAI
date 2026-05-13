import type { ReactNode } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { cn } from '../../lib/cn';
import {
  formatPriceCents,
  pricePerThousandCents,
  type SubscriptionPlanInfo,
} from '../../lib/stripeBilling';

/* ============================================================== *
 * PlanCard — eine Abo-Stufe als Karte mit Conversion-Trigger.
 *
 * Design-Prinzipien:
 * - Highlighted Plan (z. B. "Beliebteste") sticht visuell heraus
 *   (Gradient-Border, sanfter Glow, kontrastierter CTA).
 * - "Pro 1.000 Credits"-Vergleich → macht Wert messbar.
 * - Feature-Bullets mit Check-Icons (klassisches SaaS-Muster).
 * - "Jetzt sichern"-CTA statt "kaufen" — niedrigere Schwelle.
 * ============================================================== */

export type PlanCardProps = {
  plan: SubscriptionPlanInfo;
  /** Stückpreis (Cent) pro 1.000 Credits vom günstigsten Plan — für die Ersparnis-Anzeige. */
  baselinePricePerThousandCents?: number;
  loading?: boolean;
  disabled?: boolean;
  isCurrent?: boolean;
  /** Wird gerufen, wenn der CTA geklickt wird. */
  onSelect: (slug: SubscriptionPlanInfo['slug']) => void;
  /** Optional: zusätzlicher CTA-Text statt Default. */
  ctaLabel?: ReactNode;
};

export const PlanCard = ({
  plan,
  baselinePricePerThousandCents,
  loading = false,
  disabled = false,
  isCurrent = false,
  onSelect,
  ctaLabel,
}: PlanCardProps) => {
  const pricePerK = pricePerThousandCents(plan.credits, plan.price_cents);
  const showSavings =
    typeof baselinePricePerThousandCents === 'number' &&
    baselinePricePerThousandCents > 0 &&
    pricePerK < baselinePricePerThousandCents;
  const savings = showSavings
    ? Math.round(((baselinePricePerThousandCents! - pricePerK) / baselinePricePerThousandCents!) * 100)
    : 0;

  return (
    <div className={cn('relative h-full', plan.highlighted && 'sm:-translate-y-1')}>
      {plan.highlighted ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-[1px] rounded-[18px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-500 opacity-90 blur-[2px]"
        />
      ) : null}
      <Card
        className={cn(
          'relative flex h-full flex-col !p-0',
          plan.highlighted
            ? 'border-transparent shadow-[0_20px_50px_-20px_rgba(124,58,237,0.45)]'
            : 'border-slate-200',
        )}
      >
        {/* Decorative top stripe */}
        <div
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-[3px] rounded-t-[14px]',
            plan.highlighted
              ? 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500'
              : 'bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100',
          )}
        />

        {plan.badge ? (
          <span
            className={cn(
              'absolute right-5 top-5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              plan.highlighted
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_4px_12px_-4px_rgba(124,58,237,0.6)]'
                : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
            )}
          >
            {plan.highlighted ? <Sparkles size={11} aria-hidden /> : null}
            {plan.badge}
          </span>
        ) : null}

        <div className="flex flex-1 flex-col p-6 pt-7">
          <div className="min-w-0">
            <h3 className="text-base font-semibold uppercase tracking-wider text-slate-500">
              {plan.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-snug text-slate-600">{plan.tagline}</p>
          </div>

          <div className="mt-5 flex items-baseline gap-2">
            <span
              className={cn(
                'font-display text-5xl font-bold leading-none tracking-tight',
                plan.highlighted
                  ? 'bg-gradient-to-br from-violet-700 via-fuchsia-600 to-indigo-700 bg-clip-text text-transparent'
                  : 'text-slate-900',
              )}
            >
              {formatPriceCents(plan.price_cents)}
            </span>
            <span className="text-sm font-medium text-slate-500">/ Monat</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
            <span className="font-semibold text-slate-700">
              {plan.credits.toLocaleString('de-DE')} Credits / Monat
            </span>
            <span aria-hidden className="text-slate-300">·</span>
            <span className="tabular-nums">
              {formatPriceCents(pricePerK)} pro 1.000 Credits
            </span>
            {showSavings ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                −{savings}&nbsp;%
              </span>
            ) : null}
          </div>

          <ul className="mt-5 flex flex-1 flex-col gap-2.5 text-[13.5px] text-slate-700">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                    plan.highlighted ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700',
                  )}
                  aria-hidden
                >
                  <Check size={11} strokeWidth={3} />
                </span>
                <span className="min-w-0 leading-snug">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <Button
              type="button"
              fullWidth
              size="lg"
              variant={plan.highlighted ? 'primary' : 'secondary'}
              disabled={disabled || isCurrent}
              loading={loading}
              leftIcon={loading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : undefined}
              onClick={() => onSelect(plan.slug)}
              className={cn(
                plan.highlighted &&
                  '!bg-gradient-to-r !from-violet-600 !to-indigo-600 hover:!from-violet-700 hover:!to-indigo-700',
              )}
            >
              {isCurrent ? 'Dein aktueller Plan' : ctaLabel ?? 'Jetzt sichern'}
            </Button>
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Monatlich kündbar · Keine Setup-Kosten
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
