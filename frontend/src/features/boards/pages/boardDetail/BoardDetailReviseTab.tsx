import { useEffect, useRef } from 'react';
import { Undo2 } from 'lucide-react';
import { Alert, Button } from '../../../../components/ui';
import { RevisionModeSelect } from '../../components/quality/RevisionModeSelect';
import { RevisionQuickActions } from '../../components/quality/RevisionQuickActions';
import type { BoardDetail, RevisionMode } from '../../types';

export function BoardDetailReviseTab({
  value,
  onChange,
  mode,
  onModeChange,
  error,
  revertError,
  busyRunning,
  busyQueued = false,
  revertBusy,
  canRevert,
  onRevert,
  onSubmit,
  board,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: RevisionMode;
  onModeChange: (m: RevisionMode) => void;
  error: string | null;
  revertError: string | null;
  /** Aktiver Netzwerk-Lauf für diese Board-Überarbeitung (Spinner am Absenden). */
  busyRunning: boolean;
  /** Mind. ein Überarbeitungs-Job wartet noch in der globalen KI-Warteschlange. */
  busyQueued?: boolean;
  revertBusy: boolean;
  canRevert: boolean;
  onRevert: () => void;
  onSubmit: () => void;
  board: BoardDetail;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Beschreibe in eigenen Worten, was am Board verändert werden soll. Die KI liefert eine überarbeitete
        Komplettfassung von HTML, CSS und JavaScript zurück.
      </p>
      {busyQueued ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Mindestens eine Überarbeitung steht noch in der KI-Warteschlange — du kannst weitere Wünsche absenden; sie
          werden nacheinander ausgeführt.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <RevisionModeSelect value={mode} onChange={onModeChange} disabled={busyRunning} />
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-600">Schnellauswahl</label>
          <RevisionQuickActions
            disabled={busyRunning}
            onPick={(action) => {
              onModeChange(action.mode);
              if (!value.trim()) onChange(action.prompt);
            }}
          />
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        placeholder="z. B. Mache es grundschulgerechter und füge eine Wortspeicher-Box hinzu."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {revertError && <Alert tone="error">{revertError}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Status:{' '}
          {board.status === 'generated' ? 'Erzeugt' : board.status === 'draft' ? 'Entwurf' : board.status}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canRevert && (
            <Button
              type="button"
              variant="secondary"
              onClick={onRevert}
              loading={revertBusy}
              disabled={busyRunning}
              leftIcon={<Undo2 size={14} aria-hidden />}
            >
              Letzte Überarbeitung rückgängig
            </Button>
          )}
          <Button onClick={onSubmit} loading={busyRunning} disabled={revertBusy}>
            Board überarbeiten
          </Button>
        </div>
      </div>
    </div>
  );
}
