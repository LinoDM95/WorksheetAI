import { api } from './api';
import type { WorksheetLibraryItem } from '../types';


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

export const BOARDS_LIST_QUERY_KEY = ['boards', 'list'] as const;
export const BOARDS_FOLDERS_QUERY_KEY = ['boards', 'folders'] as const;
export const BOARDS_DETAIL_QUERY_KEY = (id: string) => ['boards', 'detail', id] as const;
export const BOARDS_REVISIONS_QUERY_KEY = (id: string) => ['boards', 'revisions', id] as const;
export const BOARDS_BLOCKS_QUERY_KEY = ['boards', 'blocks'] as const;

export type BoardLibraryScope = 'all' | 'mine';

export const boardsLibraryQueryKey = (scope: BoardLibraryScope = 'all') =>
  ['boards', 'library', scope] as const;

export type WorksheetLibraryScope = 'all' | 'mine';

export const worksheetsLibraryQueryKey = (scope: WorksheetLibraryScope = 'all') =>
  ['worksheets', 'library', scope] as const;

export const fetchWorksheetLibrary = async (scope: WorksheetLibraryScope = 'all'): Promise<WorksheetLibraryItem[]> => {
  const r = await api.get<WorksheetLibraryItem[]>('/worksheets/library/', { params: { scope } });
  return Array.isArray(r.data) ? r.data : [];
};

export const boardsLibraryCommentsQueryKey = (boardId: string) =>
  ['boards', 'library-comments', boardId] as const;

export const boardLibraryEntryQueryKey = (boardId: string) =>
  ['boards', 'library-entry', boardId] as const;
