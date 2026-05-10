import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { formatAxiosDrfError, formatDrfErrorPayload } from '../formatDrfError';

describe('formatDrfErrorPayload', () => {
  it('liest detail als String', () => {
    expect(formatDrfErrorPayload({ detail: 'Ungültige Anmeldedaten.' }).general).toBe(
      'Ungültige Anmeldedaten.',
    );
  });

  it('kombiniert non_field_errors', () => {
    const r = formatDrfErrorPayload({ non_field_errors: ['A', 'B'] });
    expect(r.general).toBe('A B');
  });

  it('mappt Feldfehler', () => {
    const r = formatDrfErrorPayload({ email: ['bereits registriert'] });
    expect(r.fields.email).toBe('bereits registriert');
    expect(r.general).toBe('');
  });
});

describe('formatDrfErrorPayload (edge cases)', () => {
  it('fällt bei null/undefined auf "Ein Fehler ist aufgetreten" zurück', () => {
    expect(formatDrfErrorPayload(null).general).toMatch(/Fehler/i);
    expect(formatDrfErrorPayload(undefined).general).toMatch(/Fehler/i);
  });

  it('akzeptiert detail als Array', () => {
    const r = formatDrfErrorPayload({ detail: ['A', 'B'] });
    expect(r.general).toBe('A B');
  });

  it('serialisiert verschachtelte Objekt-Fehler als JSON', () => {
    const r = formatDrfErrorPayload({ address: { street: ['fehlt'] } });
    expect(r.fields.address).toContain('fehlt');
  });

  it('vermischt detail + non_field_errors + field-Fehler', () => {
    const r = formatDrfErrorPayload({
      detail: 'Top',
      non_field_errors: ['NFE'],
      email: ['bad'],
    });
    expect(r.general).toContain('Top');
    expect(r.general).toContain('NFE');
    expect(r.fields.email).toBe('bad');
  });

  it('verwirft nur-Whitespace-Felder', () => {
    const r = formatDrfErrorPayload({ email: ['   '] });
    expect(r.fields.email).toBeUndefined();
    expect(r.general).toMatch(/Fehler/i);
  });
});

describe('formatAxiosDrfError', () => {
  it('liefert Hinweis bei Netzwerkfehler ohne Response', () => {
    const err = new axios.AxiosError(
      'Network Error',
      'ERR_NETWORK',
      undefined,
      undefined,
      undefined,
    );
    expect(formatAxiosDrfError(err).general).toContain('Keine Verbindung');
  });

  it('liest JSON-Fehlerkörper wie zuvor', () => {
    const err = new axios.AxiosError('bad request', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      data: { email: ['ungültig'] },
    } as any);
    expect(formatAxiosDrfError(err).fields.email).toBe('ungültig');
  });

  it('liest String-Fehlerkörper als general (gekürzt auf 500)', () => {
    const long = 'x'.repeat(800);
    const err = new axios.AxiosError('bad', 'ERR', undefined, undefined, {
      status: 500,
      data: long,
    } as any);
    const r = formatAxiosDrfError(err);
    expect(r.general.length).toBeLessThanOrEqual(500);
  });

  it('fällt mit Status-Hinweis zurück, wenn data leer ist', () => {
    const err = new axios.AxiosError('bad', 'ERR', undefined, undefined, {
      status: 503,
      data: undefined,
    } as any);
    expect(formatAxiosDrfError(err).general).toMatch(/503/);
  });

  it('robust bei nicht-Axios-Error', () => {
    const r = formatAxiosDrfError(new Error('oops'));
    expect(r.general).toMatch(/Fehler/i);
  });
});
