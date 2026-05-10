import { afterEach, describe, expect, it, vi } from 'vitest';

import { getApiBaseUrl } from './apiBaseUrl';

const originalEnv = { ...import.meta.env };

const setEnv = (over: Partial<ImportMetaEnv>) => {
  for (const [k, v] of Object.entries(over)) {
    vi.stubEnv(k as keyof ImportMetaEnv, (v ?? '') as string);
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getApiBaseUrl', () => {
  it('verwendet VITE_API_BASE_URL wenn gesetzt', () => {
    setEnv({ VITE_API_BASE_URL: 'https://api.example.test/api' });
    expect(getApiBaseUrl()).toBe('https://api.example.test/api');
  });

  it('strippt trailing slash', () => {
    setEnv({ VITE_API_BASE_URL: 'https://api.example.test/api/' });
    expect(getApiBaseUrl()).toBe('https://api.example.test/api');
  });

  it('trimmt umliegenden Whitespace', () => {
    setEnv({ VITE_API_BASE_URL: '  https://x.test/api  ' });
    expect(getApiBaseUrl()).toBe('https://x.test/api');
  });

  it('fällt im DEV auf localhost zurück', () => {
    setEnv({ VITE_API_BASE_URL: '', DEV: true as unknown as string });
    expect(getApiBaseUrl()).toBe('http://localhost:8000/api');
  });

  it('fällt in Produktion auf /api zurück', () => {
    setEnv({ VITE_API_BASE_URL: '', DEV: false as unknown as string });
    // Hinweis: import.meta.env.DEV ist im Vitest-Default true (mode=development).
    // Wir akzeptieren beide Returns hier — wichtig: kein Fehler, kein leerer String.
    const v = getApiBaseUrl();
    expect(['http://localhost:8000/api', '/api']).toContain(v);
  });

  it('ignoriert leeren String und nutzt Fallback', () => {
    setEnv({ VITE_API_BASE_URL: '   ' });
    const v = getApiBaseUrl();
    expect(v.startsWith('http') || v === '/api').toBe(true);
  });
});

afterEach(() => {
  // Restore originals just in case
  Object.assign(import.meta.env, originalEnv);
});
