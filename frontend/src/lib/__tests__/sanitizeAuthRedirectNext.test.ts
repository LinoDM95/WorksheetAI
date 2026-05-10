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

  it('lehnt protokollbehaftete Pfade ab', () => {
    expect(sanitizeAuthRedirectNext('javascript:alert(1)')).toBeNull();
    expect(sanitizeAuthRedirectNext('http://example.com/app')).toBeNull();
    expect(sanitizeAuthRedirectNext('mailto:a@b.de')).toBeNull();
    expect(sanitizeAuthRedirectNext('data:text/html,<script>')).toBeNull();
  });

  it('lehnt nicht-string Werte ab', () => {
    // @ts-expect-error – bewusst ungültiger Typ
    expect(sanitizeAuthRedirectNext(undefined)).toBeNull();
    // @ts-expect-error – bewusst ungültiger Typ
    expect(sanitizeAuthRedirectNext(123)).toBeNull();
  });

  it('trimmt Whitespace', () => {
    expect(sanitizeAuthRedirectNext('   /app/dashboard   ')).toBe('/app/dashboard');
  });

  it('lehnt App-fremde Pfade auch mit Query/Hash ab', () => {
    expect(sanitizeAuthRedirectNext('/admin?x=1')).toBeNull();
    expect(sanitizeAuthRedirectNext('/api/users')).toBeNull();
    expect(sanitizeAuthRedirectNext('/foo#bar')).toBeNull();
  });

  it('behandelt /app korrekt aber lehnt /apparently ab', () => {
    expect(sanitizeAuthRedirectNext('/app')).toBe('/app');
    expect(sanitizeAuthRedirectNext('/apparently')).toBeNull();
    expect(sanitizeAuthRedirectNext('/appstore')).toBeNull();
  });

  it('behält /s/-Pfade mit Query', () => {
    expect(sanitizeAuthRedirectNext('/s/token123?lang=de')).toBe('/s/token123?lang=de');
  });
});
