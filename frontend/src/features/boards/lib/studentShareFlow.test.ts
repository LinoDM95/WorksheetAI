import { describe, expect, it } from 'vitest';
import { needsStudentSharePrep } from './studentShareFlow';

describe('needsStudentSharePrep', () => {
  it('true wenn kein Token', () => {
    expect(
      needsStudentSharePrep({
        share_token: null,
        student_link_enabled: false,
        student_link_expires_at: null,
      }),
    ).toBe(true);
  });

  it('true wenn Link deaktiviert', () => {
    expect(
      needsStudentSharePrep({
        share_token: 'abc',
        student_link_enabled: false,
        student_link_expires_at: null,
      }),
    ).toBe(true);
  });

  it('true wenn aktiv aber kein Ablaufdatum (Server verlangt begrenzte Gültigkeit)', () => {
    expect(
      needsStudentSharePrep({
        share_token: 'abc',
        student_link_enabled: true,
        student_link_expires_at: null,
      }),
    ).toBe(true);
  });

  it('true wenn Ablauf in der Vergangenheit', () => {
    expect(
      needsStudentSharePrep({
        share_token: 'abc',
        student_link_enabled: true,
        student_link_expires_at: '2000-01-01T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('true wenn Ablauf-String unparsbar ist', () => {
    expect(
      needsStudentSharePrep({
        share_token: 'abc',
        student_link_enabled: true,
        student_link_expires_at: 'kein-gültiges-datum',
      }),
    ).toBe(true);
  });

  it('false wenn alles gültig (Token, aktiviert, Ablauf in Zukunft)', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(
      needsStudentSharePrep({
        share_token: 'abc',
        student_link_enabled: true,
        student_link_expires_at: future,
      }),
    ).toBe(false);
  });

  it('true wenn board null/undefined', () => {
    expect(needsStudentSharePrep(null)).toBe(true);
    expect(needsStudentSharePrep(undefined)).toBe(true);
  });

  it('true wenn Ablauf exakt jetzt liegt (nicht streng in der Zukunft)', () => {
    const now = new Date(Date.now()).toISOString();
    expect(
      needsStudentSharePrep({
        share_token: 'abc',
        student_link_enabled: true,
        student_link_expires_at: now,
      }),
    ).toBe(true);
  });
});
