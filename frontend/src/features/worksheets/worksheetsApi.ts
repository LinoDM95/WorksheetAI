import { api } from '../../lib/api';
import type { Worksheet, WorksheetLibraryCommentRow, WorksheetLibraryPreview, WorksheetRevision } from '../../types';

export type WorksheetFolderDto = {
  id: string;
  parent: string | null;
  name: string;
  sort_order: number;
  path: string;
};

export const fetchWorksheetFolders = () =>
  api.get<WorksheetFolderDto[] | { results: WorksheetFolderDto[] }>('/worksheets/folders/').then((r) => {
    const raw = (r.data as { results?: WorksheetFolderDto[] }).results ?? r.data;
    return Array.isArray(raw) ? (raw as WorksheetFolderDto[]) : [];
  });

export const createWorksheetFolder = (payload: { name: string; parent?: string | null }) =>
  api.post<WorksheetFolderDto>('/worksheets/folders/', payload).then((r) => r.data);

export const deleteWorksheetFolder = (folderId: string) =>
  api.delete(`/worksheets/folders/${folderId}/`).then((r) => r.data);

export const updateWorksheetFolder = (
  folderId: string,
  body: { name?: string; parent?: string | null; sort_order?: number },
) => api.patch<WorksheetFolderDto>(`/worksheets/folders/${folderId}/`, body).then((r) => r.data);

export const fetchWorksheetRevisions = (id: string) =>
  api.get<WorksheetRevision[]>(`/worksheets/${id}/revisions/`).then((r) => r.data);

export const applyWorksheetRevision = (id: string, revisionId: string) =>
  api.post<Worksheet>(`/worksheets/${id}/apply-revision/`, { revision_id: revisionId }).then((r) => r.data);

export const deleteWorksheetRevision = (id: string, revisionId: string) =>
  api.post<Worksheet>(`/worksheets/${id}/delete-revision/`, { revision_id: revisionId }).then((r) => r.data);

export const fetchWorksheetLibraryEntry = (worksheetId: string) =>
  api.get<WorksheetLibraryPreview>(`/worksheets/${worksheetId}/library-entry/`).then((r) => r.data);

export const fetchWorksheetLibraryComments = (worksheetId: string) =>
  api
    .get<WorksheetLibraryCommentRow[]>(`/worksheets/${worksheetId}/library-comments/`)
    .then((r) => (Array.isArray(r.data) ? r.data : []));

export const postWorksheetLibraryComment = (worksheetId: string, text: string) =>
  api.post<WorksheetLibraryCommentRow>(`/worksheets/${worksheetId}/library-comments/`, { text }).then((r) => r.data);

export type WorksheetLibraryRateResponse = {
  stars: number;
  avg_rating: number | null;
  rating_count: number;
};

export const rateWorksheetInLibrary = (worksheetId: string, stars: number) =>
  api
    .post<WorksheetLibraryRateResponse>(`/worksheets/${worksheetId}/rate/`, { stars })
    .then((r) => r.data);

export const adoptWorksheetFromLibrary = (worksheetId: string) =>
  api.post<Worksheet>(`/worksheets/${worksheetId}/adopt-from-library/`).then((r) => r.data);
