import { ArrowLeft, Download, Globe2, Trash2, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button } from '../../components/ui';
import { formatDate } from '../../lib/formatDate';
import { formatDateTime } from '../../lib/formatDate';
import { revisionVLabel } from '../../lib/revisionVLabel';
import type { Worksheet, WorksheetRevision } from '../../types';

export type WorksheetDetailPageHeaderProps = {
  ws: Worksheet;
  displayTitle: string;
  readOnly: boolean;
  userIsStaff: boolean;
  libraryBusy: boolean;
  libraryPublishLabel: string;
  libraryWithdrawLabel: string;
  libListed: boolean;
  libMod: Worksheet['library_moderation_status'];
  onLibraryPublish: () => void;
  onLibraryWithdraw: () => void;
  onLibraryListingEdit?: () => void;
  staffLibBusy: boolean;
  onStaffUnpublish?: () => void | Promise<void>;
  onStaffDelete?: () => void | Promise<void>;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  statusLabel?: string;
  onUndo?: () => void;
  canUndo?: boolean;
  revisions?: WorksheetRevision[];
  previewRevisionId?: string | null;
  onPreviewRevisionChange?: (id: string | null) => void;
  previewRevision?: WorksheetRevision | null;
  applyRevisionPending?: boolean;
  onApplyRevision?: (revisionId: string) => void;
  deleteRevisionPending?: boolean;
  onDeleteRevisionEntry?: (revisionId: string) => void;
};

export function WorksheetDetailPageHeader({
  ws,
  displayTitle,
  readOnly,
  userIsStaff,
  libraryBusy,
  libraryPublishLabel,
  libraryWithdrawLabel,
  libListed,
  libMod,
  onLibraryPublish,
  onLibraryWithdraw,
  onLibraryListingEdit,
  staffLibBusy,
  onStaffUnpublish,
  onStaffDelete,
  saving,
  hasUnsavedChanges,
  onSave,
  statusLabel,
  onUndo,
  canUndo = false,
  revisions,
  previewRevisionId = null,
  onPreviewRevisionChange = () => {},
  previewRevision = null,
  applyRevisionPending = false,
  onApplyRevision = () => {},
  deleteRevisionPending = false,
  onDeleteRevisionEntry = () => {},
}: WorksheetDetailPageHeaderProps) {
  const navigate = useNavigate();
  const rm = (ws.render_model || {}) as Record<string, unknown>;
  const subjectLine =
    (ws.subject || '').trim() || String(rm.subtitle ?? '').trim() || null;
  const subtitleParts = [subjectLine, ws.grade != null ? `Klasse ${ws.grade}` : null].filter(
    Boolean,
  ) as string[];
  const publicLabel =
    ws.library_published_at != null && String(ws.library_published_at).trim() !== ''
      ? formatDateTime(ws.library_published_at)
      : '—';
  const catalogListingTitle =
    (ws.library_listing_title || '').trim() || (ws.title || '').trim() || '—';

  return (
    <header className="relative flex shrink-0 flex-col gap-1 border-b border-slate-200/80 bg-white/95 px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top,0px))] shadow-sm backdrop-blur-sm sm:px-3">
      <div className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="!px-2"
          onClick={() => navigate('/app/worksheets')}
          aria-label="Zurück zur Liste"
          leftIcon={<ArrowLeft size={14} aria-hidden />}
        >
          <span className="hidden sm:inline">Zurück</span>
        </Button>

        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

        <div className="min-w-0 max-w-[min(100%,11rem)] sm:max-w-xs">
          <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{displayTitle || 'Ohne Titel'}</p>
          {(subtitleParts.length > 0 || statusLabel) && (
            <p className="truncate text-[10px] text-slate-500 sm:text-xs">
              {subtitleParts.join(' · ')}
              {statusLabel && (subtitleParts.length > 0 ? ` · ${statusLabel}` : statusLabel)}
            </p>
          )}
        </div>

        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />

        {revisions !== undefined && !readOnly ? (
          <>
            <div className="flex min-w-0 max-w-[min(100%,18rem)] items-center gap-1.5 sm:max-w-[20rem]">
              <span className="hidden shrink-0 text-[11px] text-slate-600 sm:inline">Version</span>
              <select
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-1 text-[11px] text-slate-800 sm:text-xs"
                value={previewRevisionId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onPreviewRevisionChange(v === '' ? null : v);
                }}
                disabled={revisions.length === 0 || applyRevisionPending}
                aria-label="Arbeitsblatt-Version"
                title="Zwischen Versionen wechseln; mit Übernehmen den Stand aktiv setzen"
              >
                <option value="">Aktueller Stand</option>
                {revisions.map((r, idx) => (
                  <option key={r.id} value={r.id}>
                    {revisionVLabel(idx, revisions.length)} · {formatDate(r.created_at)}
                  </option>
                ))}
              </select>
            </div>
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
          </>
        ) : null}

        {readOnly ? (
          <Badge tone="neutral" className="shrink-0" aria-live="polite">
            Bibliothek · Nur Lesen
          </Badge>
        ) : null}

        <span className="w-full sm:w-auto sm:flex-1" aria-hidden />

        <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
          {!readOnly && onUndo ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="!px-2"
              onClick={onUndo}
              disabled={!canUndo}
              title="Letzte Bearbeitung rückgängig (bis zu 10 Schritte). Tastatur: Strg+Z außerhalb von Textfeldern."
              aria-label="Rückgängig"
              leftIcon={<Undo2 size={13} aria-hidden />}
            >
              <span className="hidden sm:inline">Rückgängig</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="!px-2"
            onClick={() => window.print()}
            title="Druckdialog: A4, Ränder „Keine“, „Als PDF speichern“."
            aria-label="Als PDF speichern"
            leftIcon={<Download size={13} aria-hidden />}
          >
            PDF
          </Button>
          {!readOnly ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="!px-2"
              onClick={onSave}
              disabled={saving || !hasUnsavedChanges}
              loading={saving}
            >
              {saving ? 'Speichert' : 'Speichern'}
            </Button>
          ) : null}
        </div>
      </div>

      {userIsStaff && readOnly ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={staffLibBusy}
            disabled={staffLibBusy || !libListed}
            onClick={() => void onStaffUnpublish?.()}
          >
            Aus öffentlicher Bibliothek entfernen
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-800 hover:bg-red-50"
            loading={staffLibBusy}
            disabled={staffLibBusy}
            onClick={() => void onStaffDelete?.()}
          >
            Arbeitsblatt endgültig löschen
          </Button>
          <span className="text-[11px] text-amber-950/80">Moderation (fremdes Arbeitsblatt)</span>
        </div>
      ) : null}

      {!readOnly && libListed ? (
        <div className="mt-1 rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50/90 px-3 py-2.5 ring-1 ring-emerald-200/70">
          <div className="flex min-w-0 flex-1 gap-2">
            <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wide text-emerald-950">Öffentlich in der Bibliothek</p>
              <p className="mt-0.5 text-sm font-semibold text-emerald-900">
                Freigegeben: <span className="tabular-nums text-emerald-950">{publicLabel}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-emerald-800/90">
                <span className="font-medium">Eintrag:</span> {catalogListingTitle}
              </p>
              <p className="mt-2 text-[11px] text-emerald-800/80">
                Änderungen am Arbeitsblatt sind erst nach erneuter Einreichung bzw. Freigabe für alle sichtbar.
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onLibraryListingEdit ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={libraryBusy}
                disabled={libraryBusy}
                onClick={onLibraryListingEdit}
              >
                Bibliotheks-Texte
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={libraryBusy}
              disabled={libraryBusy}
              onClick={onLibraryWithdraw}
            >
              {libraryWithdrawLabel}
            </Button>
            <span className="text-[11px] text-emerald-900/85">Sichtbar im Reiter „Bibliothek“ unter Arbeitsblätter.</span>
          </div>
        </div>
      ) : !readOnly ? (
        <div className="mt-1 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <span>
              {libMod === 'pending'
                ? 'Einreichung zur Bibliothek ist in Prüfung.'
                : libMod === 'rejected'
                  ? 'Die letzte Bibliothekseinreichung wurde abgelehnt.'
                  : 'Nur für dich sichtbar.'}
            </span>
            {!userIsStaff && libMod === 'pending' ? (
              <p className="text-[11px] text-slate-600">Freigabe ausstehend — noch nicht in der Bibliothek.</p>
            ) : null}
            {!userIsStaff && libMod === 'rejected' ? (
              <p className="text-[11px] text-amber-800">Letzte Einreichung wurde abgelehnt. Du kannst erneut einreichen.</p>
            ) : null}
          </div>
          {libMod === 'pending' ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={libraryBusy}
              disabled={libraryBusy}
              onClick={onLibraryWithdraw}
            >
              {libraryWithdrawLabel}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="secondary" loading={libraryBusy} disabled={libraryBusy} onClick={onLibraryPublish}>
              {libraryPublishLabel}
            </Button>
          )}
        </div>
      ) : null}
    </header>
  );
}
