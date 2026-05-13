import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type BackofficeModerationKind = 'board' | 'worksheet';

const ENDPOINTS = {
  board: {
    approve: (id: string) => `/auth/backoffice/boards/${id}/approve/`,
    reject: (id: string) => `/auth/backoffice/boards/${id}/reject/`,
    destroy: (id: string) => `/auth/backoffice/boards/${id}/`,
  },
  worksheet: {
    approve: (id: string) => `/auth/backoffice/worksheets/${id}/approve/`,
    reject: (id: string) => `/auth/backoffice/worksheets/${id}/reject/`,
    destroy: (id: string) => `/auth/backoffice/worksheets/${id}/`,
  },
} as const;

/**
 * Wiederverwendbare Moderationsaktionen (Freigeben / Ablehnen / Löschen) für Smartboards und Arbeitsblätter.
 *
 * Wird sowohl von der Backoffice-Liste als auch vom Review-Modal verwendet — gleiche Endpunkte,
 * gleiche Cache-Invalidations.
 */
export function useBackofficeModerationActions(onAfterMutate?: () => void) {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['backoffice', 'pending'] });
    void qc.invalidateQueries({ queryKey: ['boards'] });
    void qc.invalidateQueries({ queryKey: ['worksheets'] });
    void qc.invalidateQueries({ queryKey: ['library'] });
    onAfterMutate?.();
  };

  const approve = useMutation({
    mutationFn: async ({ kind, id }: { kind: BackofficeModerationKind; id: string }) =>
      api.post(ENDPOINTS[kind].approve(id)),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async ({ kind, id }: { kind: BackofficeModerationKind; id: string }) =>
      api.post(ENDPOINTS[kind].reject(id)),
    onSuccess: invalidate,
  });

  const destroy = useMutation({
    mutationFn: async ({ kind, id }: { kind: BackofficeModerationKind; id: string }) =>
      api.delete(ENDPOINTS[kind].destroy(id)),
    onSuccess: invalidate,
  });

  const busy = approve.isPending || reject.isPending || destroy.isPending;

  return { approve, reject, destroy, busy } as const;
}
