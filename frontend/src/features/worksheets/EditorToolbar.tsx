import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Download, PanelRight, PanelRightClose, Undo2 } from 'lucide-react';
import { Badge, Button } from '../../components/ui';

export type EditorToolbarProps = {
  title: string;
  subject?: string;
  grade?: number | null;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  /** Ungespeicherte Änderungen verwerfen (optional). */
  onDiscard?: () => void;
  /** Speicher-Status-Text rechts neben dem Titel. */
  statusLabel?: string;
  /** Bearbeitungs-Sidebar ein-/ausklappen. */
  editSidebarOpen?: boolean;
  onToggleEditSidebar?: () => void;
  /** Letzte Inhaltsänderungen rückgängig (lokaler Verlauf). */
  onUndo?: () => void;
  canUndo?: boolean;
};

export const EditorToolbar = ({
  title,
  subject,
  grade,
  saving,
  hasUnsavedChanges,
  onSave,
  onDiscard,
  statusLabel,
  editSidebarOpen,
  onToggleEditSidebar,
  onUndo,
  canUndo = false,
}: EditorToolbarProps) => {
  const navigate = useNavigate();
  const subtitleParts = [subject, grade != null ? `Klasse ${grade}` : null].filter(Boolean);

  return (
    <div className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/app/worksheets')}
          aria-label="Zurück zur Liste"
          leftIcon={<ArrowLeft size={14} aria-hidden />}
        >
          Zurück
        </Button>
        <div className="hidden h-5 w-px bg-[var(--color-border)] sm:block" aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-[var(--color-ink-900)]" title={title}>
            {title || 'Ohne Titel'}
          </div>
          {(subtitleParts.length > 0 || statusLabel) && (
            <div className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-500)]">
              {subtitleParts.join(' · ')}
              {statusLabel && (subtitleParts.length > 0 ? ` · ${statusLabel}` : statusLabel)}
            </div>
          )}
        </div>
        <Badge tone={hasUnsavedChanges ? 'warn' : 'success'} className="ml-1" aria-live="polite">
          {hasUnsavedChanges ? (
            <>· Ungespeichert</>
          ) : (
            <>
              <Check size={11} aria-hidden /> Gespeichert
            </>
          )}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {onToggleEditSidebar ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleEditSidebar}
            aria-expanded={editSidebarOpen ?? false}
            aria-controls="worksheet-edit-sidebar"
            title={editSidebarOpen ? 'Bearbeitungs-Sidebar ausblenden' : 'Bearbeitungs-Sidebar einblenden'}
            leftIcon={
              editSidebarOpen ? (
                <PanelRightClose size={13} aria-hidden />
              ) : (
                <PanelRight size={13} aria-hidden />
              )
            }
          >
            <span className="hidden sm:inline">{editSidebarOpen ? 'Ausblenden' : 'Bearbeitung'}</span>
            <span className="sr-only">
              {editSidebarOpen ? 'Bearbeitungs-Sidebar ausblenden' : 'Bearbeitungs-Sidebar einblenden'}
            </span>
          </Button>
        ) : null}
        {onUndo ? (
          <Button
            variant="secondary"
            size="sm"
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
          variant="secondary"
          size="sm"
          onClick={() => window.print()}
          title="Druckdialog: Papierformat A4 (oder „Standard“ mit A4), Ränder „Keine“, Skalierung 100 %. Dann „Als PDF speichern“."
          aria-label="Als PDF speichern"
          leftIcon={<Download size={13} aria-hidden />}
        >
          PDF
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving || !hasUnsavedChanges}
          loading={saving}
        >
          {saving ? 'Speichert' : 'Speichern'}
        </Button>
        {onDiscard && hasUnsavedChanges ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
            aria-label="Ungespeicherte Änderungen verwerfen"
            className="text-slate-600"
          >
            Verwerfen
          </Button>
        ) : null}
      </div>
    </div>
  );
};
