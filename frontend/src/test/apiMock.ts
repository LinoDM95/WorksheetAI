import { vi, expect } from 'vitest';

/**
 * Helper für API-Tests: ein vollständig stubbarer api-Mock,
 * den wir per `vi.mock('../../lib/api', () => ({ api: createApiMock() }))` injecten.
 *
 * Pro Aufruf liefert die jeweilige Methode den nächsten Wert aus der `queue`,
 * sonst den `defaultResponse`. Jeder Aufruf wird mit Methode/URL/Config aufgezeichnet.
 *
 * WICHTIG für Vitest-Hoisting:
 *   `vi.mock(...)` wird an den Anfang des Files gehoistet.
 *   Variablen, die in der Mock-Factory referenziert werden, müssen in
 *   `vi.hoisted(() => ...)` deklariert werden, damit sie vor dem Mock existieren.
 *
 *   const { apiMock } = vi.hoisted(() => ({ apiMock: createApiMock() }));
 *   vi.mock('../../lib/api', () => ({ api: apiMock, refreshAuthCookies: vi.fn() }));
 */

export type ApiCall = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  url: string;
  data?: unknown;
  config?: Record<string, unknown> | undefined;
};

export type ApiMock = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  calls: ApiCall[];
  queueOk: (data: unknown, status?: number) => void;
  queueError: (err: unknown) => void;
  setDefault: (data: unknown, status?: number) => void;
  reset: () => void;
};

const makeResponse = (data: unknown, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config: {},
});

export const createApiMock = (): ApiMock => {
  const calls: ApiCall[] = [];
  const queue: Array<{ kind: 'ok'; data: unknown; status: number } | { kind: 'err'; err: unknown }> =
    [];
  let defaultData: unknown = {};
  let defaultStatus = 200;

  const handle =
    (method: ApiCall['method']) =>
    async (url: string, ...args: unknown[]) => {
      const next = queue.shift();
      const data = method === 'get' || method === 'delete' ? undefined : args[0];
      const config = (method === 'get' || method === 'delete' ? args[0] : args[1]) as
        | Record<string, unknown>
        | undefined;
      calls.push({ method, url, data, config });
      if (next?.kind === 'err') throw next.err;
      if (next?.kind === 'ok') return makeResponse(next.data, next.status);
      return makeResponse(defaultData, defaultStatus);
    };

  return {
    get: vi.fn(handle('get')),
    post: vi.fn(handle('post')),
    put: vi.fn(handle('put')),
    patch: vi.fn(handle('patch')),
    delete: vi.fn(handle('delete')),
    calls,
    queueOk: (data, status = 200) => queue.push({ kind: 'ok', data, status }),
    queueError: (err) => queue.push({ kind: 'err', err }),
    setDefault: (data, status = 200) => {
      defaultData = data;
      defaultStatus = status;
    },
    reset: () => {
      queue.length = 0;
      calls.length = 0;
      defaultData = {};
      defaultStatus = 200;
    },
  };
};

/** Erleichtert `expect(api.calls).toEqual([...])` Vergleiche. */
export const lastCall = (m: ApiMock): ApiCall | undefined => m.calls[m.calls.length - 1];

export const expectCalledWith = (
  m: ApiMock,
  method: ApiCall['method'],
  urlMatcher: string | RegExp,
) => {
  const found = m.calls.find(
    (c) =>
      c.method === method &&
      (typeof urlMatcher === 'string' ? c.url === urlMatcher : urlMatcher.test(c.url)),
  );
  expect(found, `expected ${method.toUpperCase()} ${urlMatcher}`).toBeTruthy();
  return found!;
};

/**
 * Convenience: erstellt einen api-Mock + ein vorgefertigtes Mock-Modul-Objekt,
 * das in `vi.mock('../../lib/api', ...)` zurückgegeben werden kann.
 *
 * Verwendung im Test:
 *   const { apiMock, apiModule } = vi.hoisted(() => {
 *     const { createApiMockModule } = require('...'); // funktioniert in vi.hoisted nicht
 *   });
 *
 * → da `require` in ESM nicht synchron ist, müssen Tests `createApiMock()`
 *   direkt im hoisted-Block aufrufen. Diese Datei darf KEINE Module importieren,
 *   die selbst auf `axios` oder `lib/api` aufbauen.
 */
export const createApiModuleMock = (apiMock: ApiMock) => ({
  api: apiMock,
  refreshAuthCookies: vi.fn(async () => undefined),
  DEFAULT_API_TIMEOUT_MS: 30_000,
  LONG_RUNNING_BOARD_TIMEOUT_MS: 600_000,
});
