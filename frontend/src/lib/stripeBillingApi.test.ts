import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, getMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock('./api', () => ({
  api: { post: postMock, get: getMock },
  refreshAuthCookies: vi.fn(),
  DEFAULT_API_TIMEOUT_MS: 30_000,
  LONG_RUNNING_BOARD_TIMEOUT_MS: 600_000,
}));

import {
  listCreditPackages,
  startCreditCheckout,
  startStripeCheckout,
} from './stripeBilling';

beforeEach(() => {
  postMock.mockReset();
  getMock.mockReset();
});

const respond = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config: {} });

describe('listCreditPackages', () => {
  it('liest die `packages`-Array-Form aus dem Endpunkt', async () => {
    getMock.mockResolvedValueOnce(
      respond({
        packages: [
          {
            slug: 'pack_1k',
            name: 'Mini',
            credits: 1000,
            price_cents: 149,
            currency: 'eur',
            badge_label: '',
            highlighted: false,
          },
        ],
      }),
    );

    const list = await listCreditPackages();
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe('pack_1k');
    expect(getMock).toHaveBeenCalledWith('/auth/credit-packages/');
  });

  it('gibt leere Liste zurueck wenn `packages` fehlt', async () => {
    getMock.mockResolvedValueOnce(respond({}));
    const list = await listCreditPackages();
    expect(list).toEqual([]);
  });
});

describe('startCreditCheckout', () => {
  it('postet `package_slug` und gibt URL zurueck', async () => {
    postMock.mockResolvedValueOnce(respond({ url: 'https://checkout.stripe.com/abc' }));

    const url = await startCreditCheckout('pack_10k');
    expect(url).toBe('https://checkout.stripe.com/abc');
    expect(postMock).toHaveBeenCalledWith(
      '/auth/stripe/credits-checkout/',
      { package_slug: 'pack_10k' },
    );
  });

  it('liefert null wenn keine URL geliefert wird', async () => {
    postMock.mockResolvedValueOnce(respond({}));
    const url = await startCreditCheckout('pack_10k');
    expect(url).toBeNull();
  });
});

describe('startStripeCheckout (Abo)', () => {
  it('akzeptiert neuen `basic_5`-Slug', async () => {
    postMock.mockResolvedValueOnce(respond({ url: 'https://checkout.stripe.com/sub' }));

    const url = await startStripeCheckout('basic_5');
    expect(url).toBe('https://checkout.stripe.com/sub');
    expect(postMock).toHaveBeenCalledWith(
      '/auth/stripe/checkout/',
      { plan_slug: 'basic_5' },
    );
  });
});
