import axios from 'axios';
import { getApiBaseUrl } from '../../lib/apiBaseUrl';

export type PublicBoardPayload = {
  title: string;
  html: string;
  css: string;
  javascript: string;
  used_libraries: string[];
  used_datasets: string[];
};

export const fetchPublicBoardByToken = (shareToken: string) =>
  axios
    .get<PublicBoardPayload>(`${getApiBaseUrl()}/boards/public-play/${encodeURIComponent(shareToken)}/`, {
      timeout: 60_000,
    })
    .then((r) => r.data);

const PRESENCE_CID_PREFIX = 'board_presence_cid:';

export const getOrCreateStudentPresenceClientId = (shareToken: string): string => {
  const key = PRESENCE_CID_PREFIX + shareToken;
  let v = sessionStorage.getItem(key);
  if (!v) {
    v =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, v);
  }
  return v;
};

export const postStudentPresence = (
  shareToken: string,
  clientId: string,
  action: 'touch' | 'leave',
) =>
  axios.post(
    `${getApiBaseUrl()}/boards/public-play/${encodeURIComponent(shareToken)}/presence/`,
    { client_id: clientId, action },
    { timeout: 15_000, withCredentials: false },
  );

export const postStudentPresenceLeaveBeacon = (shareToken: string, clientId: string): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  const url = `${getApiBaseUrl()}/boards/public-play/${encodeURIComponent(shareToken)}/presence/`;
  const body = JSON.stringify({ client_id: clientId, action: 'leave' });
  return navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
};

export const buildStudentBoardUrl = (shareToken: string): string => {
  if (typeof window === 'undefined') return '';
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim().replace(/\/$/, '');
  const origin = configured || window.location.origin;
  const prefix = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${origin}${prefix}/s/${encodeURIComponent(shareToken)}`;
};
