import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui';
import { cn } from '../../../lib/cn';

export const STUDENT_SHARE_DURATION_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: '15 Minuten', minutes: 15 },
  { label: '45 Minuten', minutes: 45 },
  { label: '2 Stunden', minutes: 120 },
  { label: '8 Stunden', minutes: 480 },
  { label: 'Ohne Ablauf', minutes: null },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (validMinutes: number | null) => void;
  busy?: boolean;
};

export function BoardStudentSharePrepModal({ open, onClose, onConfirm, busy }: Props) {
  const defaultMinutes = STUDENT_SHARE_DURATION_OPTIONS[1]!.minutes;
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(defaultMinutes);

  useEffect(() => {
    if (!open) return;
    setSelectedMinutes(defaultMinutes);
  }, [open, defaultMinutes]);

  if (!open || typeof document === 'undefined') return null;

  const modal = (
    <div
      className="fixed inset-0 z-[490] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-share-prep-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        aria-label="Schließen"
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="student-share-prep-title" className="text-lg font-semibold text-slate-900">
            QR &amp; Link für Schüler:innen
          </h2>
          <IconButton type="button" aria-label="Schließen" disabled={busy} onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Wähle, wie lange der Zugang gültig sein soll. Anschließend wird der Schüler-Link aktiv, du siehst den Link und
          den QR-Code — ohne weiteres Anhaken im Menü.
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Gültigkeitsdauer</legend>
          {STUDENT_SHARE_DURATION_OPTIONS.map((opt) => (
            <label
              key={opt.label}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition',
                selectedMinutes === opt.minutes
                  ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-slate-200 hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name="share-duration"
                className="accent-indigo-600"
                checked={selectedMinutes === opt.minutes}
                onChange={() => setSelectedMinutes(opt.minutes)}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" loading={busy} onClick={() => onConfirm(selectedMinutes)}>
            Link erzeugen
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
