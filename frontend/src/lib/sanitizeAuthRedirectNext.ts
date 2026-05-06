/**
 * Erlaubt nur interne SPA-Pfade nach Login/Registrierung (kein Open-Redirect).
 */
export const DEFAULT_AUTH_REDIRECT = '/app/dashboard';

export const sanitizeAuthRedirectNext = (raw: string | null): string | null => {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('/') || t.startsWith('//') || t.includes('://')) return null;
  try {
    const u = new URL(t, 'https://worksheetai.invalid');
    const path = u.pathname;
    if (path === '/app' || path.startsWith('/app/') || path.startsWith('/s/')) {
      return `${path}${u.search}`;
    }
  } catch {
    return null;
  }
  return null;
};
