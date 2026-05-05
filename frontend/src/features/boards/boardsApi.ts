import { api } from '../../lib/api';
import type {
  BlockRegistryResponse,
  BoardAiQualityTier,
  BoardCodeUpdate,
  BoardDetail,
  BoardFolderDto,
  BoardGeneratePayload,
  BoardLibraryItem,
  BoardListItem,
  BoardRevision,
  BoardValidationResult,
  CompositionPlan,
} from './types';

export const fetchBoards = () =>
  api.get<BoardListItem[] | { results: BoardListItem[] }>('/boards/').then((r) => {
    const raw = (r.data as { results?: BoardListItem[] }).results ?? r.data;
    return Array.isArray(raw) ? (raw as BoardListItem[]) : [];
  });

export const fetchBoardFolders = () =>
  api.get<BoardFolderDto[] | { results: BoardFolderDto[] }>('/boards/folders/').then((r) => {
    const raw = (r.data as { results?: BoardFolderDto[] }).results ?? r.data;
    return Array.isArray(raw) ? (raw as BoardFolderDto[]) : [];
  });

export const createBoardFolder = (payload: { name: string; parent?: string | null }) =>
  api.post<BoardFolderDto>('/boards/folders/', payload).then((r) => r.data);

export const deleteBoardFolder = (folderId: string) =>
  api.delete(`/boards/folders/${folderId}/`).then((r) => r.data);

export const updateBoardFolder = (
  folderId: string,
  body: { name?: string; parent?: string | null; sort_order?: number },
) => api.patch<BoardFolderDto>(`/boards/folders/${folderId}/`, body).then((r) => r.data);

export const fetchBoard = (id: string) =>
  api.get<BoardDetail>(`/boards/${id}/`).then((r) => r.data);

export const fetchBoardLibrary = () =>
  api.get<BoardLibraryItem[]>('/boards/library/').then((r) =>
    Array.isArray(r.data) ? r.data : [],
  );

export type BoardRateResult = {
  stars: number;
  avg_rating: number | null;
  rating_count: number;
};

export const rateBoardInLibrary = (boardId: string, stars: number) =>
  api.post<BoardRateResult>(`/boards/${boardId}/rate/`, { stars }).then((r) => r.data);

export const adoptBoardFromLibrary = (boardId: string) =>
  api.post<BoardDetail>(`/boards/${boardId}/adopt-from-library/`).then((r) => r.data);

export const generateBoard = (payload: BoardGeneratePayload) =>
  api.post<BoardDetail>('/boards/generate/', payload).then((r) => r.data);

export const reviseBoard = (
  id: string,
  prompt: string,
  opts?: { ai_quality_tier?: BoardAiQualityTier },
) =>
  api
    .post<{ board: BoardDetail; revision: BoardRevision }>(`/boards/${id}/revise/`, {
      prompt,
      ...(opts?.ai_quality_tier === 'ultra' ? { ai_quality_tier: 'ultra' } : {}),
    })
    .then((r) => r.data);

export const updateBoardCode = (id: string, body: BoardCodeUpdate) =>
  api.patch<BoardDetail>(`/boards/${id}/`, body).then((r) => r.data);

export const validateBoardCode = (id: string, body?: { html?: string; css?: string; javascript?: string }) =>
  api.post<BoardValidationResult>(`/boards/${id}/validate/`, body ?? {}).then((r) => r.data);

export const fetchBoardRevisions = (id: string) =>
  api.get<BoardRevision[]>(`/boards/${id}/revisions/`).then((r) => r.data);

export const revertLastBoardRevision = (id: string, revisionId: string) =>
  api.post<BoardDetail>(`/boards/${id}/revert-revision/`, { revision_id: revisionId }).then((r) => r.data);

export const duplicateBoard = (id: string) =>
  api.post<BoardDetail>(`/boards/${id}/duplicate/`).then((r) => r.data);

export const deleteBoard = (id: string) =>
  api.delete(`/boards/${id}/`).then((r) => r.data);

// ----- Bausteinmodus -------------------------------------------------------

export const fetchBlockRegistry = () =>
  api.get<BlockRegistryResponse>('/boards/blocks/').then((r) => r.data);

export const generateBoardFromBlocks = (plan: CompositionPlan) =>
  api.post<BoardDetail>('/boards/generate-blocks/', plan).then((r) => r.data);
