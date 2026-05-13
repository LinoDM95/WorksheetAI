import { describe, expect, it } from 'vitest';

import {
  formatPriceCents,
  pricePerThousandCents,
  savingsPercent,
  SUBSCRIPTION_PLANS,
} from './stripeBilling';

describe('SUBSCRIPTION_PLANS', () => {
  it('enthält genau drei Pläne in aufsteigender Preisfolge', () => {
    expect(SUBSCRIPTION_PLANS).toHaveLength(3);
    const prices = SUBSCRIPTION_PLANS.map((p) => p.price_cents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(SUBSCRIPTION_PLANS.map((p) => p.slug)).toEqual(['basic_5', 'starter_10', 'pro_20']);
  });

  it('enthält genau einen hervorgehobenen Plan ("Beliebteste")', () => {
    const highlighted = SUBSCRIPTION_PLANS.filter((p) => p.highlighted);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].slug).toBe('starter_10');
  });

  it('jeder Plan liefert mindestens drei Feature-Bullets (Conversion-Trigger)', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(plan.features.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('alle Pläne haben denselben Stueckpreis pro 1.000 Credits (transparente Preisbasis)', () => {
    const perK = SUBSCRIPTION_PLANS.map((p) =>
      pricePerThousandCents(p.credits, p.price_cents),
    );
    for (const v of perK) {
      expect(v).toBe(perK[0]);
    }
  });
});

describe('formatPriceCents', () => {
  it('formatiert Cent in deutsches Eurosormat', () => {
    expect(formatPriceCents(1299)).toBe('12,99 €');
    expect(formatPriceCents(500)).toBe('5,00 €');
    expect(formatPriceCents(0)).toBe('0,00 €');
  });

  it('clamped negative Werte auf 0', () => {
    expect(formatPriceCents(-50)).toBe('0,00 €');
  });

  it('andere Währungen werden als Großbuchstaben angezeigt', () => {
    expect(formatPriceCents(1000, 'usd')).toBe('10,00 USD');
  });
});

describe('pricePerThousandCents', () => {
  it('rechnet Stückpreis pro 1.000 Credits korrekt', () => {
    expect(pricePerThousandCents(10_000, 1299)).toBe(130);
    expect(pricePerThousandCents(1_000, 149)).toBe(149);
    expect(pricePerThousandCents(50_000, 5499)).toBe(110);
  });

  it('vermeidet Division durch null', () => {
    expect(pricePerThousandCents(0, 100)).toBe(0);
  });
});

describe('savingsPercent', () => {
  it('berechnet Ersparnis korrekt', () => {
    expect(savingsPercent(110, 149)).toBe(26);
    expect(savingsPercent(130, 149)).toBe(13);
  });

  it('liefert 0 bei gleichem oder höherem Preis', () => {
    expect(savingsPercent(149, 149)).toBe(0);
    expect(savingsPercent(200, 149)).toBe(0);
  });

  it('verteidigt sich gegen 0-Baseline', () => {
    expect(savingsPercent(100, 0)).toBe(0);
  });
});
