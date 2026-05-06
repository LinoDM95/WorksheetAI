import { describe, expect, it } from 'vitest';
import { formatDrfErrorPayload } from '../formatDrfError';

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
