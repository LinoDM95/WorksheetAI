import { api } from './api';

/** Geteilter Cache für alle Listen-Ansichten (Dashboard, „Meine Arbeitsblätter“). */
export const WORKSHEET_LIST_QUERY_KEY = ['worksheets', 'list'] as const;

export const fetchWorksheetList = async <T>(): Promise<T[]> => {
  const r = await api.get('/worksheets/');
  const raw = r.data.results ?? r.data;
  return Array.isArray(raw) ? (raw as T[]) : [];
};

export const PATTERNS_LIST_QUERY_KEY = ['patterns', 'list'] as const;

export const fetchPatternsList = async <T>(): Promise<T[]> => {
  const r = await api.get('/patterns/');
  const raw = r.data.results ?? r.data;
  return Array.isArray(raw) ? (raw as T[]) : [];
};

/** Nach Create/Update/Delete Listen kurz als frisch markieren (Navigation fühlt sich schneller an). */
export const WORKSHEET_LIST_STALE_MS = 120_000;
