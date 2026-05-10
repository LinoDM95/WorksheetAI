import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_API_TIMEOUT_MS,
  LONG_RUNNING_BOARD_TIMEOUT_MS,
  api,
  refreshAuthCookies,
} from './api';

describe('api instance', () => {
  it('hat eine baseURL gesetzt', () => {
    expect(api.defaults.baseURL).toBeTruthy();
  });

  it('schickt Cookies (withCredentials)', () => {
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('hat sinnvolles Timeout (>0)', () => {
    expect(api.defaults.timeout).toBeGreaterThan(0);
    expect(DEFAULT_API_TIMEOUT_MS).toBeGreaterThan(0);
    expect(LONG_RUNNING_BOARD_TIMEOUT_MS).toBeGreaterThanOrEqual(DEFAULT_API_TIMEOUT_MS);
  });
});

describe('refreshAuthCookies', () => {
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as never);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it('ruft /auth/token/refresh/ auf', async () => {
    await refreshAuthCookies();
    expect(postSpy).toHaveBeenCalledWith('/auth/token/refresh/', {});
  });

  it('dedupliziert parallele Aufrufe (in-flight)', async () => {
    let resolveOnce: (() => void) | null = null;
    postSpy.mockImplementation(
      () =>
        new Promise((res) => {
          resolveOnce = () =>
            res({
              data: {},
              status: 200,
              statusText: 'OK',
              headers: {},
              config: {},
            } as never);
        }),
    );
    const p1 = refreshAuthCookies();
    const p2 = refreshAuthCookies();
    expect(postSpy).toHaveBeenCalledTimes(1);
    resolveOnce?.();
    await Promise.all([p1, p2]);
  });
});
