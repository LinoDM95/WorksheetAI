import { createPortal } from 'react-dom';
import { useEffect, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCode } from 'react-qr-code';
import { X } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui';
import { formatDateTime, formatTimeRemainingUntil } from '../../../lib/formatDate';
import { cn } from '../../../lib/cn';
import { STUDENT_SHARE_DURATION_OPTIONS } from './BoardStudentSharePrepModal';

const shellTransition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };
const panelTransition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

type Props = {
  open: boolean;
  title: string;
  studentUrl: string;
  /** ISO; Gültigkeit Ende */
  expiresAt?: string | null;
  onClose: () => void;
  /** Lehrkraft: Ablauf ab jetzt neu setzen (PATCH `student_link_valid_minutes`). */
  onResetValidity?: (validMinutes: number) => void;
  resetBusy?: boolean;
  /** Wenn gesetzt: Portal-Ziel (z. B. Randlos-/Fullscreen-Wurzel), sonst `document.body`. */
  portalRootRef?: RefObject<HTMLElement | null>;
};

export const BoardShareQrModal = ({
  open,
  title,
  studentUrl,
  expiresAt,
  onClose,
  onResetValidity,
  resetBusy,
  portalRootRef,
}: Props) => {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const defaultResetMinutes = STUDENT_SHARE_DURATION_OPTIONS[3]!.minutes;
  const [resetMinutes, setResetMinutes] = useState<number>(defaultResetMinutes);

  useEffect(() => {
    if (!open) return;
    setResetMinutes(defaultResetMinutes);
  }, [open, defaultResetMinutes]);

  useEffect(() => {
    if (expiresAt) setNowTick(Date.now());
  }, [expiresAt]);

  useEffect(() => {
    if (!open || !expiresAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [open, expiresAt]);

  const qrSize =
    typeof window !== 'undefined' ? Math.min(400, Math.max(280, window.innerWidth - 48)) : 320;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
    } catch {
      /* ignore */
    }
  };

  const remaining = expiresAt ? formatTimeRemainingUntil(expiresAt, nowTick) : null;
  const isExpired = remaining === 'abgelaufen';

  if (typeof document === 'undefined') return null;

  const portalParent = portalRootRef?.current ?? document.body;

  const overlay = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="board-share-qr-shell"
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="board-share-qr-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={shellTransition}
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            aria-label="Schließen"
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 max-h-[min(92dvh,900px)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={panelTransition}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h2 id="board-share-qr-title" className="text-xl font-semibold text-slate-900 sm:text-2xl">
                Link &amp; QR für Schüler:innen
              </h2>
              <IconButton type="button" aria-label="Schließen" onClick={onClose}>
                <X size={22} aria-hidden />
              </IconButton>
            </div>
            <p className="mb-4 text-sm text-slate-600 sm:text-base">
              Scan mit dem Handy — es öffnet sich <strong>nur diese Übung</strong>, ohne Anmeldung und ohne Zugriff auf
              andere Bereiche der App.
            </p>
            {expiresAt ? (
              <div
                className={cn(
                  'mb-4 rounded-lg px-3 py-2.5 text-sm ring-1',
                  isExpired
                    ? 'bg-red-50 text-red-950 ring-red-200'
                    : 'bg-amber-50 text-amber-950 ring-amber-200',
                )}
              >
                <p className="font-medium">
                  QR-Link gültig: <strong>{remaining}</strong>
                </p>
                <p className={cn('mt-1 text-xs sm:text-sm', isExpired ? 'text-red-800' : 'text-amber-900/90')}>
                  Endet am: <strong>{formatDateTime(expiresAt)}</strong>
                  {isExpired ? (
                    <span className="block pt-1 font-medium">
                      Schüler:innen können die Übung nicht mehr öffnen — bitte Gültigkeit neu setzen.
                    </span>
                  ) : null}
                </p>
              </div>
            ) : (
              <p className="mb-4 text-sm text-slate-500">
                Es ist immer ein Ablaufdatum gesetzt (maximal 3 Tage). Du kannst die Gültigkeit hier neu festlegen,
                wenn die Zeit fast um ist oder verlängern willst.
              </p>
            )}
            {onResetValidity ? (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-800">Gültigkeit neu setzen</p>
                <p className="mb-3 text-xs text-slate-600 sm:text-sm">
                  Der Timer startet <strong>ab jetzt</strong> mit der gewählten Dauer (ersetzt die bisherige Restzeit).
                  QR und Link bleiben gleich.
                </p>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Neue Gültigkeitsdauer</legend>
                  {STUDENT_SHARE_DURATION_OPTIONS.map((opt) => (
                    <label
                      key={opt.label}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-2 text-sm transition',
                        resetMinutes === opt.minutes
                          ? 'border-indigo-400 ring-1 ring-indigo-200'
                          : 'border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <input
                        type="radio"
                        name="share-reset-duration"
                        className="accent-indigo-600"
                        checked={resetMinutes === opt.minutes}
                        onChange={() => setResetMinutes(opt.minutes)}
                        disabled={resetBusy}
                      />
                      {opt.label}
                    </label>
                  ))}
                </fieldset>
                <Button
                  type="button"
                  className="mt-4 w-full sm:w-auto"
                  loading={resetBusy}
                  disabled={resetBusy}
                  onClick={() => onResetValidity(resetMinutes)}
                >
                  Gültigkeit neu setzen
                </Button>
              </div>
            ) : null}
            <div className="flex justify-center rounded-xl bg-white p-4 ring-1 ring-slate-100 sm:p-6">
              <QRCode value={studentUrl} size={qrSize} level="M" bgColor="#ffffff" fgColor="#0f172a" />
            </div>
            <p
              className="mt-4 break-all rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-700 ring-1 ring-slate-100 sm:text-sm"
              title={studentUrl}
            >
              {studentUrl}
            </p>
            {title ? (
              <p className="mt-2 truncate text-center text-sm text-slate-500" title={title}>
                {title}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button type="button" variant="secondary" size="lg" onClick={() => void handleCopy()}>
                Link kopieren
              </Button>
              <Button type="button" size="lg" onClick={onClose}>
                Schließen
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(overlay, portalParent);
};
