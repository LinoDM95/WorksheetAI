import { api } from '../../lib/api';
import type { Worksheet, WorksheetRevision } from '../../types';

export const fetchWorksheetRevisions = (id: string) =>
  api.get<WorksheetRevision[]>(`/worksheets/${id}/revisions/`).then((r) => r.data);

export const applyWorksheetRevision = (id: string, revisionId: string) =>
  api.post<Worksheet>(`/worksheets/${id}/apply-revision/`, { revision_id: revisionId }).then((r) => r.data);

export const deleteWorksheetRevision = (id: string, revisionId: string) =>
  api.post<Worksheet>(`/worksheets/${id}/delete-revision/`, { revision_id: revisionId }).then((r) => r.data);
