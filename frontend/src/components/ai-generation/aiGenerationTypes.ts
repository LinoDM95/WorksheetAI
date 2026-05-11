/** Max. gleichzeitig wartende KI-Aufträge (Status `queued`) app-weit. */
export const AI_GENERATION_MAX_QUEUED = 4;

export const AI_GENERATION_QUEUE_FULL_MESSAGE =
  'Es können höchstens 4 Generierungen gleichzeitig in der Warteschlange stehen. Bitte warte, bis ein Auftrag startet oder beendet wird.';

export type AiGenerationJobKind =
  | 'board-creative'
  | 'board-blocks'
  | 'board-revise'
  | 'worksheet-create'
  | 'worksheet-page'
  | 'worksheet-pages';

export type AiGenerationJobStatus = 'queued' | 'running' | 'success' | 'error';

export type AiGenerationJob = {
  id: string;
  kind: AiGenerationJobKind;
  title: string;
  subtitle?: string;
  /** z. B. Arbeitsblatt-ID bei `worksheet-page` — für Busy-State pro Ressource */
  resourceId?: string;
  /** 0-basiert bei `worksheet-page` — Busy-State nur für diese Seite */
  pageIndex?: number;
  status: AiGenerationJobStatus;
  phaseLabel?: string;
  /** 0–100 wenn bekannt; `null` = unbestimmt (nur Spinner) */
  progressPercent: number | null;
  errorMessage?: string;
  successMessage?: string;
  primaryAction?: { label: string; to: string };
  createdAt: number;
  endedAt?: number;
};

export type AiGenerationJobStartInput = {
  kind: AiGenerationJobKind;
  title: string;
  subtitle?: string;
  resourceId?: string;
  pageIndex?: number;
};

export type AiGenerationCompleteOptions = {
  successMessage?: string;
  primaryAction?: { label: string; to: string };
};
