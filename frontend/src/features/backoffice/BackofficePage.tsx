import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Eye, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Card, PageHeader } from '../../components/ui';
import type { BoardLibraryItem } from '../boards/types';
import type { WorksheetLibraryItem } from '../../types';
import {
  BackofficeSourcePreviewModal,
  type BackofficePreviewTarget,
} from './BackofficeSourcePreviewModal';
import { useBackofficeModerationActions } from './useBackofficeModerationActions';

type PendingPayload = {
  boards: BoardLibraryItem[];
  worksheets: WorksheetLibraryItem[];
};

export function BackofficePage() {
  const [sourcePreview, setSourcePreview] = useState<BackofficePreviewTarget | null>(null);
  const pending = useQuery({
    queryKey: ['backoffice', 'pending'],
    queryFn: async () => (await api.get<PendingPayload>('/auth/backoffice/pending/')).data,
  });

  const moderation = useBackofficeModerationActions();

  const boards = pending.data?.boards ?? [];
  const worksheets = pending.data?.worksheets ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-3 pb-12 pt-4 sm:px-4">
      <PageHeader
        title="Backoffice"
        subtitle="Einreichungen prüfen — Smartboards interaktiv testen, Arbeitsblätter als A4 ansehen, Quelltext einsehen und freigeben."
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
        <h2 className="text-[15px] font-bold text-slate-900">
          Smartboards{' '}
          <span className="ml-1 text-[12px] font-medium text-slate-500">
            ({boards.length})
          </span>
        </h2>
        {pending.data && boards.length === 0 ? (
          <p className="text-sm text-slate-500">Keine offenen Board-Einreichungen.</p>
        ) : null}
        <div className="space-y-3">
          {boards.map((b) => (
            <ModerationCard
              key={b.id}
              title={b.title || 'Ohne Titel'}
              meta={[b.subject, b.grade, b.board_type].filter(Boolean).join(' · ') || '—'}
              ownerLabel={b.owner_label}
              topic={b.topic}
              description={b.description}
              busy={moderation.busy}
              isApproving={
                moderation.approve.isPending && moderation.approve.variables?.id === b.id
              }
              isRejecting={
                moderation.reject.isPending && moderation.reject.variables?.id === b.id
              }
              isDeleting={
                moderation.destroy.isPending && moderation.destroy.variables?.id === b.id
              }
              onOpen={() => setSourcePreview({ kind: 'board', id: b.id })}
              onApprove={() => moderation.approve.mutate({ kind: 'board', id: b.id })}
              onReject={() => moderation.reject.mutate({ kind: 'board', id: b.id })}
              onDelete={() => {
                if (window.confirm('Board unwiderruflich löschen?')) {
                  moderation.destroy.mutate({ kind: 'board', id: b.id });
                }
              }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-slate-900">
          Arbeitsblätter{' '}
          <span className="ml-1 text-[12px] font-medium text-slate-500">
            ({worksheets.length})
          </span>
        </h2>
        {pending.data && worksheets.length === 0 ? (
          <p className="text-sm text-slate-500">Keine offenen Arbeitsblatt-Einreichungen.</p>
        ) : null}
        <div className="space-y-3">
          {worksheets.map((w) => (
            <ModerationCard
              key={w.id}
              title={w.title || 'Ohne Titel'}
              meta={[w.subject, w.grade ? `Kl. ${w.grade}` : ''].filter(Boolean).join(' · ') || '—'}
              ownerLabel={w.owner_label}
              topic={w.topic}
              description={w.description}
              busy={moderation.busy}
              isApproving={
                moderation.approve.isPending && moderation.approve.variables?.id === w.id
              }
              isRejecting={
                moderation.reject.isPending && moderation.reject.variables?.id === w.id
              }
              isDeleting={
                moderation.destroy.isPending && moderation.destroy.variables?.id === w.id
              }
              onOpen={() => setSourcePreview({ kind: 'worksheet', id: w.id })}
              onApprove={() => moderation.approve.mutate({ kind: 'worksheet', id: w.id })}
              onReject={() => moderation.reject.mutate({ kind: 'worksheet', id: w.id })}
              onDelete={() => {
                if (window.confirm('Arbeitsblatt unwiderruflich löschen?')) {
                  moderation.destroy.mutate({ kind: 'worksheet', id: w.id });
                }
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

type ModerationCardProps = {
  title: string;
  meta: string;
  ownerLabel?: string;
  topic?: string;
  description?: string;
  busy: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
};

function ModerationCard(props: ModerationCardProps) {
  const {
    title,
    meta,
    ownerLabel,
    topic,
    description,
    busy,
    isApproving,
    isRejecting,
    isDeleting,
    onOpen,
    onApprove,
    onReject,
    onDelete,
  } = props;
  return (
    <Card className="!p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 cursor-pointer rounded-md text-left transition-colors hover:bg-slate-50 -mx-2 px-2 py-1"
          aria-label={`„${title}“ öffnen und prüfen`}
        >
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {meta}
            {ownerLabel ? ` · ${ownerLabel}` : ''}
          </p>
          {topic ? (
            <p className="mt-1 line-clamp-1 text-[12px] text-slate-600">{topic}</p>
          ) : null}
          {description ? (
            <p className="mt-1 line-clamp-2 text-[12px] text-slate-600">{description}</p>
          ) : null}
        </button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={<Eye size={14} aria-hidden />}
            disabled={busy}
            onClick={onOpen}
          >
            Prüfen
          </Button>
          <Button
            type="button"
            size="sm"
            leftIcon={<Check size={14} aria-hidden />}
            disabled={busy}
            loading={isApproving}
            onClick={onApprove}
          >
            Freigeben
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={<X size={14} aria-hidden />}
            disabled={busy}
            loading={isRejecting}
            onClick={onReject}
          >
            Ablehnen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-red-700 hover:bg-red-50"
            leftIcon={<Trash2 size={14} aria-hidden />}
            disabled={busy}
            loading={isDeleting}
            onClick={onDelete}
          >
            Löschen
          </Button>
        </div>
      </div>
    </Card>
  );
}
