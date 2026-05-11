import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatLongDate,
  formatRelative,
  formatTimeRemainingUntil,
} from './formatDate';

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

  it('akzeptiert Date-Objekt', () => {
    expect(formatDate(new Date('2026-04-05T10:00:00Z'))).toMatch(/2026/);
  });
});

describe('formatDateTime', () => {
  it('returns em dash for empty input', () => {
    expect(formatDateTime(null)).toBe('—');
  });
  it('liefert eine de-DE Datums+Zeit-Repräsentation', () => {
    const s = formatDateTime('2026-04-05T10:30:00Z');
    expect(s).toMatch(/2026/);
  });
});

describe('formatLongDate', () => {
  it('formatiert ein Datum mit Wochentag', () => {
    const s = formatLongDate(new Date('2026-04-06T10:00:00Z')); // Montag
    expect(s).toMatch(/2026/);
    expect(s.length).toBeGreaterThan(8);
  });
});

describe('formatTimeRemainingUntil', () => {
  it('returns em dash for empty input', () => {
    expect(formatTimeRemainingUntil(null, 0)).toBe('—');
    expect(formatTimeRemainingUntil(undefined, 0)).toBe('—');
  });

  it('returns abgelaufen when end is in the past', () => {
    const end = '2026-01-15T12:00:00.000Z';
    expect(formatTimeRemainingUntil(end, new Date('2026-01-15T12:00:01.000Z').getTime())).toBe(
      'abgelaufen',
    );
  });

  it('shows noch unter 1 Min. for positive diff under one minute', () => {
    const now = new Date('2026-01-15T12:00:00.000Z').getTime();
    const end = new Date('2026-01-15T12:00:45.000Z').toISOString();
    expect(formatTimeRemainingUntil(end, now)).toBe('noch unter 1 Min.');
  });

  it('shows Tage Std. Min. for longer spans', () => {
    const now = new Date('2026-01-15T12:00:00.000Z').getTime();
    const end = new Date('2026-01-17T14:30:00.000Z').toISOString();
    const s = formatTimeRemainingUntil(end, now);
    expect(s).toMatch(/^noch /);
    expect(s).toContain('2 Tage');
    expect(s).toContain('2 Std.');
    expect(s).toContain('30 Min.');
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

  it('shows Std. innerhalb 24h', () => {
    expect(formatRelative('2026-01-15T08:00:00.000Z')).toBe('vor 4 Std.');
  });

  it('shows gestern wenn 1 Tag her', () => {
    expect(formatRelative('2026-01-14T11:00:00.000Z')).toBe('gestern');
  });

  it('shows vor X Tagen für 2..6 Tage', () => {
    expect(formatRelative('2026-01-12T11:00:00.000Z')).toBe('vor 3 Tagen');
  });

  it('fällt nach 7 Tagen auf de-DE Datum zurück', () => {
    const s = formatRelative('2025-12-30T11:00:00.000Z');
    expect(s).toMatch(/2025/);
  });
});
