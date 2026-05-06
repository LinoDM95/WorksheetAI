import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

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
    .get<PublicBoardPayload>(`${baseURL}/boards/public-play/${encodeURIComponent(shareToken)}/`, {
      timeout: 60_000,
    })
    .then((r) => r.data);

export const buildStudentBoardUrl = (shareToken: string): string => {
  if (typeof window === 'undefined') return '';
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim().replace(/\/$/, '');
  const origin = configured || window.location.origin;
  const prefix = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${origin}${prefix}/s/${encodeURIComponent(shareToken)}`;
};
