import { api } from './api';

export type SubscriptionPlanSlug = 'starter_10' | 'pro_20';

export const SUBSCRIPTION_PLANS: {
  slug: SubscriptionPlanSlug;
  title: string;
  price: string;
  credits: number;
}[] = [
  { slug: 'starter_10', title: 'Starter', price: '10 € / Monat', credits: 5_000 },
  { slug: 'pro_20', title: 'Pro', price: '20 € / Monat', credits: 10_000 },
];

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
