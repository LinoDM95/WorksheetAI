import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Pattern } from '../types';

const miniPattern = (over: Partial<Pattern>): Pattern => ({
  id: 'p-1',
  key: 'k',
  name: 'n',
  description: '',
  status: 'active',
  blueprint: {},
  preview_svg: '',
  ...over,
});

describe('formatPatternPrice', () => {
  it('returns Inklusive for system patterns', async () => {
    const { formatPatternPrice } = await import('./patternUnlocks');
    expect(formatPatternPrice(miniPattern({ is_system: true }))).toBe('Inklusive');
  });

  it('returns EUR string for non-system', async () => {
    const { formatPatternPrice } = await import('./patternUnlocks');
    const s = formatPatternPrice(miniPattern({ is_system: false }));
    expect(s).toMatch(/[\d,]+/);
    expect(s).toContain('€');
  });

  it('is stable for same id', async () => {
    const { formatPatternPrice } = await import('./patternUnlocks');
    const p = miniPattern({ id: 'stable-id', is_system: false });
    expect(formatPatternPrice(p)).toBe(formatPatternPrice(p));
  });
});

describe('localStorage unlock flow', () => {
  const store: Record<string, string> = {};
  const dispatch = vi.fn();

  beforeEach(() => {
    store['worksheetai_owned_pattern_ids'] = '';
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: () => null,
      length: 0,
    });
    vi.stubGlobal('window', { dispatchEvent: dispatch });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isPatternUnlocked false until unlockPattern', async () => {
    const { isPatternUnlocked, unlockPattern } = await import('./patternUnlocks');
    const p = miniPattern({ id: 'buy-me', is_system: false });
    expect(isPatternUnlocked(p)).toBe(false);
    unlockPattern('buy-me');
    expect(isPatternUnlocked(p)).toBe(true);
    expect(dispatch).toHaveBeenCalled();
  });

  it('system pattern always unlocked', async () => {
    const { isPatternUnlocked } = await import('./patternUnlocks');
    expect(isPatternUnlocked(miniPattern({ id: 'sys', is_system: true }))).toBe(true);
  });
});
