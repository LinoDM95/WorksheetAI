export type AiGenerationJobKind =
  | 'board-creative'
  | 'board-blocks'
  | 'board-revise'
  | 'worksheet-create'
  | 'worksheet-page';

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
