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
});
