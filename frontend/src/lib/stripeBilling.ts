import { api } from './api';

/* ------------------------------------------------------------------ *
 * Abo-Pläne (fest verdrahtet — entsprechen Backend `SubscriptionPlan`)
 * ------------------------------------------------------------------ */

export type SubscriptionPlanSlug = 'basic_5' | 'starter_10' | 'pro_20';

export type SubscriptionPlanInfo = {
  slug: SubscriptionPlanSlug;
  title: string;
  /** Marketing-Tagline unter dem Titel. */
  tagline: string;
  price_cents: number;
  credits: number;
  /** UI-Highlight (z. B. „Beliebteste"). */
  badge?: string;
  /** Hervorgehobener Plan in der Card-Reihe. */
  highlighted?: boolean;
  /** Conversion-Bullets — vom günstigsten zum teuersten kumulativ besser. */
  features: string[];
};

export const SUBSCRIPTION_PLANS: SubscriptionPlanInfo[] = [
  {
    slug: 'basic_5',
    title: 'Basic',
    tagline: 'Einsteigen und sofort loslegen',
    price_cents: 500,
    credits: 2_500,
    features: [
      '2.500 Credits — jeden Monat frisch',
      'Voller Zugriff auf alle KI-Funktionen',
      'Smartboards & Arbeitsblätter unbegrenzt teilen',
      'Monatlich kündbar',
    ],
  },
  {
    slug: 'starter_10',
    title: 'Starter',
    tagline: 'Der beliebteste Plan für engagierte Lehrkräfte',
    price_cents: 1000,
    credits: 5_000,
    badge: 'Beliebteste',
    highlighted: true,
    features: [
      '5.000 Credits — doppelt so viele wie Basic',
      'Reicht für ca. 50 KI-Arbeitsblätter pro Monat',
      'Voller Zugriff auf alle KI-Funktionen',
      'Frühen Zugang zu neuen Features',
    ],
  },
  {
    slug: 'pro_20',
    title: 'Pro',
    tagline: 'Für Power-User mit hohem Bedarf',
    price_cents: 2000,
    credits: 10_000,
    badge: 'Für Power-User',
    features: [
      '10.000 Credits — für ganze Klassen­stufen',
      'Reicht für ca. 100 KI-Arbeitsblätter pro Monat',
      'Alles aus Starter — ohne Limits',
      'Priorisierter Support per E-Mail',
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Einmalige Credit-Pakete (vom Backend geladen)
 * ------------------------------------------------------------------ */

export type CreditPackage = {
  slug: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
  badge_label: string;
  highlighted: boolean;
};

export async function listCreditPackages(): Promise<CreditPackage[]> {
  const r = await api.get<{ packages: CreditPackage[] }>('/auth/credit-packages/');
  return r.data?.packages ?? [];
}

export async function startCreditCheckout(package_slug: string): Promise<string | null> {
  const r = await api.post<{ url: string }>('/auth/stripe/credits-checkout/', { package_slug });
  return r.data?.url ?? null;
}

/* ------------------------------------------------------------------ *
 * Stripe-Subscription-Helfer (unverändert)
 * ------------------------------------------------------------------ */

export async function startStripeCheckout(plan_slug: SubscriptionPlanSlug): Promise<string | null> {
  const r = await api.post<{ url: string }>('/auth/stripe/checkout/', { plan_slug });
  return r.data?.url ?? null;
}

export async function openStripeCustomerPortal(returnPath = '/app/abonnement'): Promise<string | null> {
  const r = await api.post<{ url: string }>('/auth/stripe/portal/', { return_path: returnPath });
  return r.data?.url ?? null;
}

export function stripeErrorMessage(e: unknown, fallback: string): string {
  if (typeof e === 'object' && e !== null && 'response' in e) {
    const data = (e as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object') {
      const rec = data as Record<string, unknown>;
      if (typeof rec.detail === 'string') return rec.detail;
    }
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * Formatierung — domain-spezifisch, hier um es DRY zu halten.
 * ------------------------------------------------------------------ */

/** Cent → "12,99 €". */
export function formatPriceCents(cents: number, currency = 'eur'): string {
  const value = (Math.max(0, Math.round(cents)) / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = currency.toLowerCase() === 'eur' ? '€' : currency.toUpperCase();
  return `${value} ${symbol}`;
}

/** Stückpreis pro 1.000 Credits — Kernkennzahl für die Vergleichsanzeige. */
export function pricePerThousandCents(credits: number, price_cents: number): number {
  if (credits <= 0) return 0;
  return Math.round((price_cents / credits) * 1000);
}

/**
 * Ersparnis ggü. dem teuersten Tarif/Paket pro Credit, in Prozent (0–100).
 * Wird genutzt, um den Vorteil größerer Pakete sichtbar zu machen.
 */
export function savingsPercent(
  pricePerThousand: number,
  baselinePricePerThousand: number,
): number {
  if (baselinePricePerThousand <= 0) return 0;
  if (pricePerThousand >= baselinePricePerThousand) return 0;
  return Math.round(((baselinePricePerThousand - pricePerThousand) / baselinePricePerThousand) * 100);
}
