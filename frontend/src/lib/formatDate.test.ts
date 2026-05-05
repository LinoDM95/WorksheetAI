import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatDate, formatRelative } from './formatDate';

describe('formatDate', () => {
  it('returns em dash for empty input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('formats ISO date in de-DE', () => {
    const s = formatDate('2026-03-02T10:00:00.000Z');
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/3|03/);
  });
});

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns em dash for empty input', () => {
    expect(formatRelative(null)).toBe('—');
  });

  it('shows gerade eben under one minute', () => {
    expect(formatRelative('2026-01-15T11:59:30.000Z')).toBe('gerade eben');
  });

  it('shows minutes within an hour', () => {
    expect(formatRelative('2026-01-15T11:30:00.000Z')).toBe('vor 30 Min.');
  });
});
