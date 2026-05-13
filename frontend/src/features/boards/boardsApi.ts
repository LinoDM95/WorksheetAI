import { api, LONG_RUNNING_BOARD_TIMEOUT_MS, refreshAuthCookies } from '../../lib/api';
import { getApiBaseUrl } from '../../lib/apiBaseUrl';
import type { BoardLibraryScope } from '../../lib/listQueries';
import type {
  AutoRepairPayload,
  BlockRegistryResponse,
  BoardAiQualityTier,
  BoardCodeUpdate,
  BoardDetail,
  BoardFolderDto,
  BoardGeneratePayload,
  BoardLibraryCommentDto,
  BoardLibraryItem,
  BoardListItem,
  BoardRevision,
  BoardValidationResult,
  CompositionPlan,
  PipelineStatus,
  QualityReport,
  RevisionMode,
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

export type BoardStudentPresence = { connected: number };

export const fetchBoardStudentPresence = (boardId: string) =>
  api.get<BoardStudentPresence>(`/boards/${boardId}/student-presence/`).then((r) => r.data);

export const fetchBoardLibrary = (scope: BoardLibraryScope = 'all') =>
  api
    .get<BoardLibraryItem[]>('/boards/library/', { params: { scope } })
    .then((r) => (Array.isArray(r.data) ? r.data : []));

export const fetchBoardLibraryEntry = (boardId: string) =>
  api.get<BoardLibraryItem>(`/boards/${boardId}/library-entry/`).then((r) => r.data);

export type BoardRateResult = {
  stars: number;
  avg_rating: number | null;
  rating_count: number;
};

export const rateBoardInLibrary = (boardId: string, stars: number) =>
  api.post<BoardRateResult>(`/boards/${boardId}/rate/`, { stars }).then((r) => r.data);

export const adoptBoardFromLibrary = (boardId: string) =>
  api.post<BoardDetail>(`/boards/${boardId}/adopt-from-library/`).then((r) => r.data);

export const fetchBoardLibraryComments = (boardId: string) =>
  api
    .get<BoardLibraryCommentDto[]>(`/boards/${boardId}/library-comments/`)
    .then((r) => (Array.isArray(r.data) ? r.data : []));

export const postBoardLibraryComment = (boardId: string, text: string) =>
  api
    .post<BoardLibraryCommentDto>(`/boards/${boardId}/library-comments/`, { text })
    .then((r) => r.data);

const longBoard = { timeout: LONG_RUNNING_BOARD_TIMEOUT_MS };

export const generateBoard = (payload: BoardGeneratePayload) =>
  api.post<BoardDetail>('/boards/generate/', payload, longBoard).then((r) => r.data);

export type BoardGeneratePhaseEvent = {
  event: 'phase';
  key: string;
  pct: number;
  label: string;
};

const boardApiBase = () => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

/** NDJSON-Stream mit Fortschrittsphasen; letzte Zeile: `{ event: 'done', board }`. */
export const generateBoardWithProgress = async (
  payload: BoardGeneratePayload,
  options: {
    onPhase: (p: BoardGeneratePhaseEvent) => void;
    signal?: AbortSignal;
  },
): Promise<BoardDetail> => {
  const url = `${getApiBaseUrl().replace(/\/$/, '')}/boards/generate/?stream=1`;
  const fetchStream = () =>
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });

  await refreshAuthCookies().catch(() => undefined);
  let res = await fetchStream();
  if (res.status === 401) {
    await refreshAuthCookies();
    res = await fetchStream();
  }
  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { detail?: string };
      if (j?.detail) detail = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let board: BoardDetail | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const row = JSON.parse(trimmed) as {
        event: string;
        key?: string;
        pct?: number;
        label?: string;
        board?: BoardDetail;
        detail?: string;
      };
      if (row.event === 'phase' && row.label != null && row.pct != null && row.key != null) {
        options.onPhase({
          event: 'phase',
          key: row.key,
          pct: Math.max(0, Math.min(100, row.pct)),
          label: row.label,
        });
      } else if (row.event === 'done' && row.board) {
        board = row.board;
      } else if (row.event === 'error') {
        throw new Error(row.detail || 'Generierung fehlgeschlagen');
      }
    }
  }
  if (buf.trim()) {
    const row = JSON.parse(buf.trim()) as {
      event: string;
      key?: string;
      pct?: number;
      label?: string;
      board?: BoardDetail;
      detail?: string;
    };
    if (row.event === 'phase' && row.label != null && row.pct != null && row.key != null) {
      options.onPhase({
        event: 'phase',
        key: row.key,
        pct: Math.max(0, Math.min(100, row.pct)),
        label: row.label,
      });
    } else if (row.event === 'done' && row.board) {
      board = row.board;
    } else if (row.event === 'error') {
      throw new Error(row.detail || 'Generierung fehlgeschlagen');
    }
  }
  if (!board) {
    throw new Error('Antwort ohne Board-Daten.');
  }
  return board;
};

export const reviseBoard = (
  id: string,
  prompt: string,
  opts?: {
    ai_quality_tier?: BoardAiQualityTier;
    revision_mode?: RevisionMode;
    signal?: AbortSignal;
  },
) =>
  api
    .post<{ board: BoardDetail; revision: BoardRevision }>(
      `/boards/${id}/revise/`,
      {
        prompt,
        ...(opts?.ai_quality_tier === 'ultra' ? { ai_quality_tier: 'ultra' } : {}),
        ...(opts?.revision_mode && opts.revision_mode !== 'general'
          ? { revision_mode: opts.revision_mode }
          : {}),
      },
      { ...longBoard, signal: opts?.signal },
    )
    .then((r) => r.data);

export const runBoardQualityCheck = (id: string) =>
  api.post<BoardDetail>(`/boards/${id}/run-quality-check/`, {}, longBoard).then((r) => r.data);

export const autoRepairBoard = (id: string, payload?: AutoRepairPayload) =>
  api
    .post<{ board: BoardDetail; revision: BoardRevision; ok: boolean }>(
      `/boards/${id}/auto-repair/`,
      payload ?? {},
      longBoard,
    )
    .then((r) => r.data);

export const fetchBoardQualityReport = (id: string) =>
  api.get<QualityReport>(`/boards/${id}/quality-report/`).then((r) => r.data);

export const fetchPipelineStatus = () =>
  api.get<PipelineStatus>('/boards/pipeline-status/').then((r) => r.data);

export const updateBoardCode = (id: string, body: BoardCodeUpdate) =>
  api.patch<BoardDetail>(`/boards/${id}/`, body).then((r) => r.data);

export const validateBoardCode = (id: string, body?: { html?: string; css?: string; javascript?: string }) =>
  api.post<BoardValidationResult>(`/boards/${id}/validate/`, body ?? {}).then((r) => r.data);

export const fetchBoardRevisions = (id: string) =>
  api.get<BoardRevision[]>(`/boards/${id}/revisions/`).then((r) => r.data);

export const revertLastBoardRevision = (id: string, revisionId: string) =>
  api.post<BoardDetail>(`/boards/${id}/revert-revision/`, { revision_id: revisionId }).then((r) => r.data);

export const applyBoardRevision = (id: string, revisionId: string) =>
  api
    .post<BoardDetail>(`/boards/${id}/apply-revision/`, { revision_id: revisionId }, longBoard)
    .then((r) => r.data);

export const deleteBoardRevision = (id: string, revisionId: string) =>
  api.post<BoardDetail>(`/boards/${id}/delete-revision/`, { revision_id: revisionId }).then((r) => r.data);

export const duplicateBoard = (id: string) =>
  api.post<BoardDetail>(`/boards/${id}/duplicate/`).then((r) => r.data);

export const deleteBoard = (id: string) =>
  api.delete(`/boards/${id}/`).then((r) => r.data);

/** Staff: Board nur aus öffentlicher Bibliothek nehmen (Board bleibt beim Besitzer). */
export const backofficeUnpublishBoard = (boardId: string) =>
  api.post(`/auth/backoffice/boards/${boardId}/unpublish/`).then((r) => r.data);

/** Staff: Board inkl. Daten endgültig löschen. */
export const backofficeDeleteBoard = (boardId: string) =>
  api.delete(`/auth/backoffice/boards/${boardId}/`).then((r) => r.data);

/** Staff: Bibliotheks-Kommentar löschen. */
export const backofficeDeleteBoardLibraryComment = (boardId: string, commentId: string) =>
  api.delete(`/auth/backoffice/boards/${boardId}/comments/${commentId}/`).then((r) => r.data);

/** Staff: Bibliotheks-Kommentar löschen (Arbeitsblatt). */
export const backofficeDeleteWorksheetLibraryComment = (worksheetId: string, commentId: string) =>
  api.delete(`/auth/backoffice/worksheets/${worksheetId}/comments/${commentId}/`).then((r) => r.data);

/** Staff: Arbeitsblatt aus öffentlicher Bibliothek nehmen. */
export const backofficeUnpublishWorksheet = (worksheetId: string) =>
  api.post(`/auth/backoffice/worksheets/${worksheetId}/unpublish/`).then((r) => r.data);

/** Staff: Arbeitsblatt endgültig löschen. */
export const backofficeDeleteWorksheet = (worksheetId: string) =>
  api.delete(`/auth/backoffice/worksheets/${worksheetId}/`).then((r) => r.data);

// ----- Bausteinmodus -------------------------------------------------------

export const fetchBlockRegistry = () =>
  api.get<BlockRegistryResponse>('/boards/blocks/').then((r) => r.data);

export const generateBoardFromBlocks = (plan: CompositionPlan, signal?: AbortSignal) =>
  api
    .post<BoardDetail>('/boards/generate-blocks/', plan, { ...longBoard, signal })
    .then((r) => r.data);
