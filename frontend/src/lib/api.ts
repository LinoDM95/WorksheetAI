import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { notifyAuthSessionExpired } from './authSessionBridge';
import { getApiBaseUrl } from './apiBaseUrl';

/** Viele sequentielle KI-Schritte (Smartboard-Pipeline + Asset Engine + QA), nicht nur ein Modellaufruf. */
const PARSED_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT_MS);
export const DEFAULT_API_TIMEOUT_MS =
  Number.isFinite(PARSED_TIMEOUT) && PARSED_TIMEOUT > 0 ? PARSED_TIMEOUT : 45 * 60 * 1000;

const PARSED_BOARD = Number(import.meta.env.VITE_API_LONG_BOARD_TIMEOUT_MS);
/** Nachprompt / Auto-Repair / mehrere Pipeline-Runden – länger als ein einzelnes LLM-Gateway. */
export const LONG_RUNNING_BOARD_TIMEOUT_MS =
  Number.isFinite(PARSED_BOARD) && PARSED_BOARD > 0 ? PARSED_BOARD : 60 * 60 * 1000;

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: DEFAULT_API_TIMEOUT_MS,
  withCredentials: true,
});

const shouldSkipRefreshRetry = (url?: string) => {
  if (!url) return true;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/token/refresh') ||
    url.includes('/auth/password-reset')
  );
};

let refreshPromise: Promise<void> | null = null;

const runRefresh = (): Promise<void> => {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/token/refresh/', {})
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

/** Erneuert HttpOnly-JWT-Cookies; für lange `fetch`-Streams nötig (kein Axios-401-Interceptor). */
export const refreshAuthCookies = (): Promise<void> => runRefresh();

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = original?.url ?? '';

    if (status === 401 && url.includes('/auth/token/refresh/')) {
      notifyAuthSessionExpired();
      return Promise.reject(error);
    }

    if (
      status !== 401 ||
      !original ||
      original._retry ||
      shouldSkipRefreshRetry(original.url)
    ) {
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      await runRefresh();
      return api.request(original);
    } catch {
      notifyAuthSessionExpired();
      return Promise.reject(error);
    }
  },
);
