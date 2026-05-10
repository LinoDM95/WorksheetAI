import { afterEach, describe, expect, it, vi } from 'vitest';

import { getApiBaseUrl } from './apiBaseUrl';

/** Nur String-Env — `vi.stubEnv` erwartet string Keys/Values (kein `ImportMetaEnv`-Key-Typing). */
const setEnv = (over: Record<string, string>) => {
  for (const [k, v] of Object.entries(over)) {
    vi.stubEnv(k, v);
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

  it('Fallback ohne gesetzte Basis-URL ist gültig (localhost oder /api)', () => {
    setEnv({ VITE_API_BASE_URL: '' });
    const v = getApiBaseUrl();
    expect(['http://localhost:8000/api', '/api']).toContain(v);
  });

  it('ignoriert leeren String und nutzt Fallback', () => {
    setEnv({ VITE_API_BASE_URL: '   ' });
    const v = getApiBaseUrl();
    expect(v.startsWith('http') || v === '/api').toBe(true);
  });
});
