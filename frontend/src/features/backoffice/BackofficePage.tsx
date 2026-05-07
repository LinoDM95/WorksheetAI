import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Check, X, Loader2, FileCode2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Card, PageHeader } from '../../components/ui';
import type { BoardLibraryItem } from '../boards/types';
import type { WorksheetLibraryItem } from '../../types';
import { cn } from '../../lib/cn';
import {
  BackofficeSourcePreviewModal,
  type BackofficePreviewTarget,
} from './BackofficeSourcePreviewModal';

type PendingPayload = {
  boards: BoardLibraryItem[];
  worksheets: WorksheetLibraryItem[];
};

export function BackofficePage() {
  const qc = useQueryClient();
  const [sourcePreview, setSourcePreview] = useState<BackofficePreviewTarget | null>(null);
  const pending = useQuery({
    queryKey: ['backoffice', 'pending'],
    queryFn: async () => (await api.get<PendingPayload>('/auth/backoffice/pending/')).data,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['backoffice', 'pending'] });
    void qc.invalidateQueries({ queryKey: ['boards'] });
    void qc.invalidateQueries({ queryKey: ['worksheets'] });
    void qc.invalidateQueries({ queryKey: ['library'] });
  };

  const approveBoard = useMutation({
    mutationFn: async (id: string) => api.post(`/auth/backoffice/boards/${id}/approve/`),
    onSuccess: invalidate,
  });
  const rejectBoard = useMutation({
    mutationFn: async (id: string) => api.post(`/auth/backoffice/boards/${id}/reject/`),
    onSuccess: invalidate,
  });
  const deleteBoard = useMutation({
    mutationFn: async (id: string) => api.delete(`/auth/backoffice/boards/${id}/`),
    onSuccess: invalidate,
  });

  const approveWs = useMutation({
    mutationFn: async (id: string) => api.post(`/auth/backoffice/worksheets/${id}/approve/`),
    onSuccess: invalidate,
  });
  const rejectWs = useMutation({
    mutationFn: async (id: string) => api.post(`/auth/backoffice/worksheets/${id}/reject/`),
    onSuccess: invalidate,
  });
  const deleteWs = useMutation({
    mutationFn: async (id: string) => api.delete(`/auth/backoffice/worksheets/${id}/`),
    onSuccess: invalidate,
  });

  const busy =
    approveBoard.isPending ||
    rejectBoard.isPending ||
    deleteBoard.isPending ||
    approveWs.isPending ||
    rejectWs.isPending ||
    deleteWs.isPending;

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-3 pb-12 pt-4 sm:px-4">
      <PageHeader
        title="Backoffice"
        subtitle="Einreichungen prüfen — vor der Freigabe den Quelltext (Board: HTML/CSS/JS, Arbeitsblatt: JSON) ansehen."
      />

      <BackofficeSourcePreviewModal
        open={sourcePreview !== null}
        target={sourcePreview}
        onClose={() => setSourcePreview(null)}
      />

      {pending.isPending ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Lade Warteschlange…
        </div>
      ) : pending.isError ? (
        <p className="text-sm text-red-600">Die Moderationsliste konnte nicht geladen werden.</p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-slate-900">Smartboards — Warteschlange</h2>
        {pending.data && pending.data.boards.length === 0 ? (
          <p className="text-sm text-slate-500">Keine offenen Board-Einreichungen.</p>
        ) : null}
        <div className="space-y-3">
          {(pending.data?.boards ?? []).map((b) => (
            <Card key={b.id} className="!p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{b.title || 'Ohne Titel'}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    {[b.subject, b.grade].filter(Boolean).join(' · ') || '—'} · {b.owner_label}
                  </p>
                  {b.topic ? <p className="mt-1 line-clamp-2 text-[12px] text-slate-600">{b.topic}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    leftIcon={<FileCode2 size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => setSourcePreview({ kind: 'board', id: b.id })}
                  >
                    Code prüfen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    leftIcon={<Check size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => approveBoard.mutate(b.id)}
                  >
                    Freigeben
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    leftIcon={<X size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => rejectBoard.mutate(b.id)}
                  >
                    Ablehnen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn('text-red-700 hover:bg-red-50')}
                    leftIcon={<Trash2 size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Board unwiderruflich löschen?')) deleteBoard.mutate(b.id);
                    }}
                  >
                    Löschen
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-slate-900">Arbeitsblätter — Warteschlange</h2>
        {pending.data && pending.data.worksheets.length === 0 ? (
          <p className="text-sm text-slate-500">Keine offenen Arbeitsblatt-Einreichungen.</p>
        ) : null}
        <div className="space-y-3">
          {(pending.data?.worksheets ?? []).map((w) => (
            <Card key={w.id} className="!p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{w.title || 'Ohne Titel'}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    {[w.subject, w.grade ? `Kl. ${w.grade}` : ''].filter(Boolean).join(' · ') || '—'} ·{' '}
                    {w.owner_label}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    leftIcon={<FileCode2 size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => setSourcePreview({ kind: 'worksheet', id: w.id })}
                  >
                    Code prüfen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    leftIcon={<Check size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => approveWs.mutate(w.id)}
                  >
                    Freigeben
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    leftIcon={<X size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => rejectWs.mutate(w.id)}
                  >
                    Ablehnen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn('text-red-700 hover:bg-red-50')}
                    leftIcon={<Trash2 size={14} aria-hidden />}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Arbeitsblatt unwiderruflich löschen?')) deleteWs.mutate(w.id);
                    }}
                  >
                    Löschen
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
