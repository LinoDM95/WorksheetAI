/** Basis-URL der DRF-API (ohne trailing slash). Produktion: `/api` wenn VITE_API_BASE_URL fehlt (Monolith). */
export const getApiBaseUrl = (): string => {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.trim().replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8000/api';
  }
  return '/api';
};
