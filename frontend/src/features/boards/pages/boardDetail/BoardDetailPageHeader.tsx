import { Globe2, Sparkles, Trash2 } from 'lucide-react';
import { Alert, Button } from '../../../../components/ui';
import { formatDate } from '../../../../lib/formatDate';
import type { BoardCodeUpdate, BoardDetail, BoardFolderDto, BoardRevision } from '../../types';
import { revisionVLabel } from './revisionVLabel';

export function BoardDetailPageHeader({
  board,
  showFatalErrors,
  onOpenFatalDetails,
  foldersSorted,
  revisions,
  previewRevisionId,
  onPreviewRevisionChange,
  previewRevision,
  applyRevisionPending,
  onApplyRevision,
  deleteRevisionPending,
  onDeleteRevisionEntry,
  canReviseWithAi,
  reviseButtonTitle,
  reviseBlockedTitle,
  onOpenRevise,
  libraryShareMessage,
  userIsStaff,
  publicOnlineVersionLabel,
  onSyncPublicLibrarySnapshot,
  onSubmitLibraryUpdate,
  onOpenLibraryModal,
  onWithdrawFromLibrary,
  patchMutation,
}: {
  board: BoardDetail;
  showFatalErrors: boolean;
  onOpenFatalDetails: () => void;
  foldersSorted: BoardFolderDto[];
  revisions: BoardRevision[];
  previewRevisionId: string | null;
  onPreviewRevisionChange: (id: string | null) => void;
  previewRevision: BoardRevision | null;
  applyRevisionPending: boolean;
  onApplyRevision: (revisionId: string) => void;
  deleteRevisionPending: boolean;
  onDeleteRevisionEntry: (revisionId: string) => void;
  canReviseWithAi: boolean;
  reviseButtonTitle?: string;
  reviseBlockedTitle?: string;
  onOpenRevise: () => void;
  libraryShareMessage: { tone: 'error' | 'info'; text: string } | null;
  userIsStaff: boolean;
  publicOnlineVersionLabel: string;
  onSyncPublicLibrarySnapshot: () => void;
  onSubmitLibraryUpdate: () => void;
  onOpenLibraryModal: (mode: 'publish' | 'edit_listing') => void;
  onWithdrawFromLibrary: () => void;
  patchMutation: { isPending: boolean; mutate: (body: BoardCodeUpdate, opts?: object) => void };
}) {
  return (
    <header className="relative z-20 flex shrink-0 flex-col gap-1 border-b border-slate-200/80 bg-white/95 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top,0px))] shadow-sm backdrop-blur-sm sm:px-3">
      {showFatalErrors && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-900 ring-1 ring-red-200">
          <span className="font-medium">Validierungsfehler im Board</span>
          <Button type="button" variant="danger" size="sm" onClick={onOpenFatalDetails}>
            Details
          </Button>
        </div>
      )}

      <div className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-1">
        <div className="min-w-0 max-w-[min(100%,11rem)] sm:max-w-xs">
          <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{board.title || 'Board'}</p>
          {board.description ? (
            <p className="truncate text-[10px] text-slate-500 sm:text-xs">{board.description}</p>
          ) : null}
        </div>

        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

        <select
          className="max-w-[140px] rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-1 text-[11px] text-slate-800 sm:max-w-[200px] sm:text-xs"
          value={board.folder?.id ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            patchMutation.mutate({ folder_id: v === '' ? null : v });
          }}
          disabled={patchMutation.isPending}
          aria-label="Galerie-Ordner"
          title="Ordner"
        >
          <option value="">Ohne Ordner</option>
          {foldersSorted.map((f) => (
            <option key={f.id} value={f.id}>
              {f.path}
            </option>
          ))}
        </select>

        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

        <select
          className="max-w-[7.5rem] rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-1 text-[11px] text-slate-800 sm:max-w-[14rem] sm:text-xs"
          value={previewRevisionId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onPreviewRevisionChange(v === '' ? null : v);
          }}
          disabled={revisions.length === 0 || applyRevisionPending}
          aria-label="Board-Version"
          title="Versionen durchblättern"
        >
          <option value="">Aktueller Stand</option>
          {revisions.map((r, idx) => (
            <option key={r.id} value={r.id}>
              {revisionVLabel(idx, revisions.length)} · {formatDate(r.created_at)}
            </option>
          ))}
        </select>

        {previewRevision ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="!px-2"
              loading={applyRevisionPending}
              onClick={() => onApplyRevision(previewRevision.id)}
            >
              Übernehmen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="!px-2"
              loading={deleteRevisionPending}
              aria-label="Versionseintrag löschen"
              onClick={() => onDeleteRevisionEntry(previewRevision.id)}
            >
              <Trash2 size={14} aria-hidden />
            </Button>
          </>
        ) : null}

        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

        <Button
          type="button"
          size="sm"
          className="!px-2"
          disabled={!canReviseWithAi}
          title={reviseButtonTitle}
          aria-label={
            canReviseWithAi
              ? 'Änderungswünsche beschreiben – KI überarbeitet das Board'
              : reviseBlockedTitle
          }
          onClick={onOpenRevise}
        >
          <Sparkles size={14} className="sm:mr-1" aria-hidden />
          <span className="hidden sm:inline">Änderungen beschreiben</span>
        </Button>
      </div>

      {libraryShareMessage ? (
        <div className="pt-1">
          <Alert tone={libraryShareMessage.tone === 'error' ? 'error' : 'info'}>{libraryShareMessage.text}</Alert>
        </div>
      ) : null}

      {board.library_public ? (
        <div className="mt-1 rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50/90 px-3 py-2.5 ring-1 ring-emerald-200/70">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="flex min-w-0 flex-1 gap-2">
              <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-emerald-950">Öffentlich in der Bibliothek</p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-900">
                  Online-Version: <span className="tabular-nums text-emerald-950">{publicOnlineVersionLabel}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-emerald-800/90">
                  <span className="font-medium">Karte:</span>{' '}
                  {board.library_listing_title?.trim() || board.title || '—'}
                </p>
                {board.library_public_live_differs ? (
                  <p className="mt-2 text-[11px] font-semibold text-amber-900">
                    Hinweis: Dein gespeicherter Arbeitsstand unterscheidet sich von dieser Online-Fassung.
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-emerald-800/80">
                    Gespeicherter Stand und öffentliche Fassung stimmen überein.
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 lg:items-end">
              <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:pt-0.5">
                {userIsStaff ? (
                  <Button
                    type="button"
                    size="sm"
                    loading={patchMutation.isPending}
                    disabled={patchMutation.isPending}
                    onClick={onSyncPublicLibrarySnapshot}
                  >
                    Öffentliche Fassung aktualisieren
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={patchMutation.isPending}
                    disabled={
                      patchMutation.isPending ||
                      !board.library_public_live_differs ||
                      board.library_moderation_status !== 'approved'
                    }
                    title={
                      board.library_moderation_status !== 'approved'
                        ? 'Nur bei freigegebenem Bibliothekseintrag sinnvoll.'
                        : undefined
                    }
                    onClick={onSubmitLibraryUpdate}
                  >
                    Update zur Freigabe einreichen
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={patchMutation.isPending}
                  onClick={() => onOpenLibraryModal('edit_listing')}
                >
                  Bibliotheks-Texte
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-800 hover:bg-red-50"
                  disabled={patchMutation.isPending}
                  onClick={onWithdrawFromLibrary}
                >
                  Aus Bibliothek nehmen
                </Button>
              </div>
              {board.avg_rating != null || (board.rating_count ?? 0) > 0 ? (
                <p className="text-[11px] text-emerald-900/80 lg:text-right">
                  Bewertung:{' '}
                  {board.avg_rating != null ? `Ø ${board.avg_rating.toFixed(1)}` : 'noch keine'}
                  {board.rating_count
                    ? ` · ${board.rating_count} Bewertung${board.rating_count === 1 ? '' : 'en'}`
                    : ''}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-700">
          <span>Dieses Board ist nur für dich sichtbar.</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={patchMutation.isPending}
            onClick={() => onOpenLibraryModal('publish')}
          >
            In Bibliothek veröffentlichen
          </Button>
        </div>
      )}
    </header>
  );
}
