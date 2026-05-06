import { describe, expect, it } from 'vitest';
import { sanitizeAuthRedirectNext } from '../sanitizeAuthRedirectNext';

describe('sanitizeAuthRedirectNext', () => {
  it('erlaubt /app und Unterpfade', () => {
    expect(sanitizeAuthRedirectNext('/app/dashboard')).toBe('/app/dashboard');
    expect(sanitizeAuthRedirectNext('/app/boards/library')).toBe('/app/boards/library');
    expect(sanitizeAuthRedirectNext('/app')).toBe('/app');
  });

  it('erlaubt Schüler-Link /s/…', () => {
    expect(sanitizeAuthRedirectNext('/s/abc123')).toBe('/s/abc123');
  });

  it('behält Query bei erlaubten Pfaden', () => {
    expect(sanitizeAuthRedirectNext('/app/foo?x=1')).toBe('/app/foo?x=1');
  });

  it('ignoriert Hash-Ziele', () => {
    expect(sanitizeAuthRedirectNext('/app/foo#section')).toBe('/app/foo');
  });

  it('lehnt Open-Redirects und Fremdpfade ab', () => {
    expect(sanitizeAuthRedirectNext('//evil.test/path')).toBeNull();
    expect(sanitizeAuthRedirectNext('https://evil.test/app')).toBeNull();
    expect(sanitizeAuthRedirectNext('/login')).toBeNull();
    expect(sanitizeAuthRedirectNext('/')).toBeNull();
    expect(sanitizeAuthRedirectNext('')).toBeNull();
    expect(sanitizeAuthRedirectNext(null)).toBeNull();
  });
});
