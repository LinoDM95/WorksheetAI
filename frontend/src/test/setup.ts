import { afterEach, beforeEach, vi } from 'vitest';

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (typeof window.ResizeObserver === 'undefined') {
    class ResizeObserverShim {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverShim;
  }

  if (typeof window.IntersectionObserver === 'undefined') {
    class IntersectionObserverShim {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [] as IntersectionObserverEntry[];
      }
    }
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      IntersectionObserverShim;
  }

  if (typeof window.scrollTo === 'undefined') {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
  }
}

beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
