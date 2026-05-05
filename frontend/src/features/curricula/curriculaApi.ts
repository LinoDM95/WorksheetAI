import { api } from '../../lib/api';

export type DiscoveryPlanEntry = {
  subject: string;
  grade_band: string;
  level_band: string[];
  topic_area: string;
  page_start: number;
  page_end: number;
  confidence: number;
};

export type CurriculumSource = {
  id: string;
  title: string;
  state: string;
  country: string;
  document_type: string;
  subject: string;
  version: string;
  year: number | null;
  file: string;
  page_count: number;
  extracted_pages: unknown[];
  extraction_status: string;
  extraction_error: string;
  discovery_status?: string;
  discovery_plan?: DiscoveryPlanEntry[];
  discovery_error?: string;
  replicate_states?: string[];
  auto_run_id?: string | null;
  jobs_count?: number;
  contexts_count?: number;
};

export type CurriculumExtractionJob = {
  id: string;
  source: string;
  source_title?: string;
  state: string;
  subject: string;
  grade_band: string;
  level_band: string[];
  topic_hint: string;
  page_start: number | null;
  page_end: number | null;
  selected_pages: number[];
  status: string;
  extracted_context: Record<string, unknown>;
  ai_raw_output: Record<string, unknown>;
  validation_errors: string[];
  review_status: string;
  review_notes: string;
  source_excerpt: Record<string, unknown>;
  extraction_summary: string;
  auto_run_id?: string | null;
  plan_index?: number | null;
};

export type CurriculumContextRow = {
  id: string;
  state: string;
  subject: string;
  grade_band: string;
  topic_area: string;
  status: string;
  quality_status: string;
  public_summary: string;
  source_refs: unknown[];
};

export const fetchCurriculumSources = () => api.get<CurriculumSource[]>('/curricula/sources/').then((r) => r.data);

export const createCurriculumSource = (fd: FormData) =>
  api.post<CurriculumSource>('/curricula/sources/', fd).then((r) => r.data);

export const fetchCurriculumSource = (id: string) =>
  api.get<CurriculumSource>(`/curricula/sources/${id}/`).then((r) => r.data);

export const extractCurriculumSourceText = (id: string) =>
  api.post<CurriculumSource>(`/curricula/sources/${id}/extract-text/`).then((r) => r.data);

export const createExtractionJob = (body: Record<string, unknown>) =>
  api.post<CurriculumExtractionJob>('/curricula/extraction-jobs/', body).then((r) => r.data);

export const fetchExtractionJob = (id: string) =>
  api.get<CurriculumExtractionJob>(`/curricula/extraction-jobs/${id}/`).then((r) => r.data);

export const runExtractionJob = (id: string) =>
  api.post<CurriculumExtractionJob>(`/curricula/extraction-jobs/${id}/run/`).then((r) => r.data);

export const patchJobContext = (id: string, extracted_context: Record<string, unknown>) =>
  api
    .patch<CurriculumExtractionJob>(`/curricula/extraction-jobs/${id}/edit-extracted-context/`, {
      extracted_context,
    })
    .then((r) => r.data);

export const approveJob = (id: string, body: { edited_context?: Record<string, unknown>; activate: boolean }) =>
  api.post(`/curricula/extraction-jobs/${id}/approve/`, body).then((r) => r.data);

export const rejectJob = (id: string, notes: string) =>
  api.post(`/curricula/extraction-jobs/${id}/reject/`, { notes }).then((r) => r.data);

export const fetchCurriculumContexts = (params?: Record<string, string>) =>
  api.get<CurriculumContextRow[]>('/curricula/contexts/', { params }).then((r) => r.data);

export const fetchCurriculumContext = (id: string) =>
  api.get<CurriculumContextRow>(`/curricula/contexts/${id}/`).then((r) => r.data);

export const patchCurriculumContext = (id: string, body: Record<string, unknown>) =>
  api.patch<CurriculumContextRow>(`/curricula/contexts/${id}/`, body).then((r) => r.data);

export const activateCurriculumContext = (id: string) =>
  api.post(`/curricula/contexts/${id}/activate/`).then((r) => r.data);

export const archiveCurriculumContext = (id: string) =>
  api.post(`/curricula/contexts/${id}/archive/`).then((r) => r.data);

export const matchCurriculum = (body: {
  state: string;
  subject: string;
  grade?: number | null;
  topic?: string;
}) => api.post('/curricula/match/', body).then((r) => r.data);

export type AutoExtractJob = {
  plan_index: number;
  status: 'completed' | 'failed' | string;
  error?: string | null;
  job_id: string | null;
  subject?: string;
  grade_band?: string;
  topic_area?: string;
};

export type AutoExtractRunResult = {
  ok: boolean;
  run_id: string;
  succeeded: number;
  failed: number;
  jobs: AutoExtractJob[];
  error?: string;
};

export type AutoRunSummary = {
  total: number;
  completed: number;
  failed: number;
  running: number;
};

export type AutoRunDetail = {
  source: CurriculumSource;
  run_id: string;
  jobs: CurriculumExtractionJob[];
  summary: AutoRunSummary;
};

export type DiscoveryServiceResult = {
  ok?: boolean;
  toc_subjects?: string[];
  toc_subject_count?: number;
  fill_rounds?: number;
  missing_after_rounds?: string[];
  max_slices_applied?: number;
  error?: string;
};

export type CurriculumSourceDiscoverResponse = CurriculumSource & {
  discovery_result?: DiscoveryServiceResult;
};

export type AutoApproveResult = {
  ok: boolean;
  run_id: string;
  created: string[];
  replicate_states: string[];
  skipped: { plan_index: number; reason: string }[];
  errors: { plan_index: number; error: string }[];
};

export const autoDiscoverSource = (id: string) =>
  api.post<CurriculumSourceDiscoverResponse>(`/curricula/sources/${id}/auto-discover/`).then((r) => r.data);

export const autoExtractSource = (id: string, selected_indices?: number[]) =>
  api
    .post<{ source: CurriculumSource; run: AutoExtractRunResult }>(
      `/curricula/sources/${id}/auto-extract/`,
      { selected_indices: selected_indices ?? [] },
    )
    .then((r) => r.data);

export const fetchAutoRun = (sourceId: string, runId: string) =>
  api.get<AutoRunDetail>(`/curricula/sources/${sourceId}/auto-run/${runId}/`).then((r) => r.data);

export const approveAutoRun = (
  sourceId: string,
  runId: string,
  body: {
    activate?: boolean;
    replicate_states?: string[];
    skip_indices?: number[];
    edited_contexts?: Record<string, unknown>;
  },
) =>
  api
    .post<AutoApproveResult>(
      `/curricula/sources/${sourceId}/auto-run/${runId}/approve/`,
      body,
    )
    .then((r) => r.data);

export type StateOptionApi = {
  slug: string;
  name: string;
  label: string;
  replicate_states: string[];
};

export const fetchStateOptions = () =>
  api.get<{ options: StateOptionApi[] }>('/curricula/state-options/').then((r) => r.data.options);
