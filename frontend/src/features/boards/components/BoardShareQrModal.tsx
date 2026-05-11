import { createPortal } from 'react-dom';
import { useEffect, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCode } from 'react-qr-code';
import { ChevronDown, Clock, Copy, X } from 'lucide-react';
import { Button, Field, IconButton } from '../../../components/ui';
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
  const [copied, setCopied] = useState(false);

  /** Nur bei neuem Link zurücksetzen — nicht bei jedem erneuten Öffnen des Dialogs. */
  useEffect(() => {
    setResetMinutes(defaultResetMinutes);
  }, [studentUrl, defaultResetMinutes]);

  useEffect(() => {
    if (expiresAt) setNowTick(Date.now());
  }, [expiresAt]);

  useEffect(() => {
    if (!open || !expiresAt) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [open, expiresAt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const [qrSize, setQrSize] = useState(240);
  useEffect(() => {
    if (!open) return;
    const compute = () => {
      const w = window.innerWidth;
      if (w >= 1024) setQrSize(228);
      else if (w >= 640) setQrSize(248);
      else setQrSize(Math.min(260, Math.max(200, Math.round(w - 120))));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
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
          className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-5"
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
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
            aria-label="Schließen"
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 max-h-[min(94dvh,880px)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.25)]"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: 6 }}
            transition={panelTransition}
          >
            <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50/90 to-white px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id="board-share-qr-title" className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                    QR &amp; Link für Schüler:innen
                  </h2>
                  {title ? (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600" title={title}>
                      {title}
                    </p>
                  ) : null}
                </div>
                <IconButton type="button" aria-label="Schließen" onClick={onClose} className="shrink-0">
                  <X size={22} aria-hidden />
                </IconButton>
              </div>
            </div>

            <div className="grid gap-6 px-5 py-5 sm:gap-8 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-start">
              <div className="flex flex-col items-center lg:items-stretch">
                <div className="rounded-2xl bg-white p-4 shadow-inner ring-1 ring-slate-200/80 sm:p-5">
                  <QRCode value={studentUrl} size={qrSize} level="M" bgColor="#ffffff" fgColor="#0f172a" />
                </div>
                <p className="mt-3 max-w-[280px] text-center text-xs leading-relaxed text-slate-500 lg:text-left">
                  Handy-Kamera öffnen — es startet <strong className="font-medium text-slate-700">nur diese Übung</strong>.
                  Keine Anmeldung nötig.
                </p>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                {expiresAt ? (
                  <div
                    className={cn(
                      'flex gap-3 rounded-xl px-3.5 py-3 text-sm ring-1',
                      isExpired
                        ? 'bg-red-50/95 text-red-950 ring-red-200/90'
                        : 'bg-amber-50/90 text-amber-950 ring-amber-200/80',
                    )}
                  >
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-medium">
                        Noch gültig: <strong>{remaining}</strong>
                      </p>
                      <p className={cn('mt-0.5 text-xs sm:text-[13px]', isExpired ? 'text-red-800/95' : 'text-amber-900/85')}>
                        Endet {formatDateTime(expiresAt)}
                        {isExpired ? (
                          <span className="mt-1 block font-medium">
                            Link nicht mehr aufrufbar — unten die Gültigkeit neu setzen.
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    Der Link läuft automatisch ab (max. 3 Tage). Du kannst die Zeit bei Bedarf neu starten.
                  </p>
                )}

                <div className="space-y-2">
                  <label htmlFor="board-share-url" className="sr-only">
                    Schüler-Link
                  </label>
                  <input
                    id="board-share-url"
                    readOnly
                    value={studentUrl}
                    className="select-all input w-full truncate font-mono text-xs text-slate-800 sm:text-sm"
                    title={studentUrl}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    size="lg"
                    className="sm:min-w-[10rem]"
                    fullWidth
                    leftIcon={<Copy size={18} aria-hidden />}
                    onClick={() => void handleCopy()}
                  >
                    {copied ? 'Kopiert!' : 'Link kopieren'}
                  </Button>
                  <Button type="button" variant="secondary" size="lg" fullWidth className="sm:w-auto" onClick={onClose}>
                    Fertig
                  </Button>
                </div>

                {onResetValidity ? (
                  <details className="group rounded-xl border border-slate-200 bg-slate-50/60 open:bg-slate-50 open:shadow-sm">
                    <summary
                      className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition hover:bg-slate-100/70 [&::-webkit-details-marker]:hidden"
                    >
                      <span>Gültigkeit neu starten</span>
                      <ChevronDown
                        size={18}
                        className="shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="border-t border-slate-200/90 px-4 pb-4 pt-3">
                      <p className="mb-3 text-xs leading-relaxed text-slate-600 sm:text-sm">
                        Timer beginnt <strong>ab jetzt</strong> mit gewählter Dauer. QR-Code und URL{' '}
                        <strong>bleiben gleich</strong>.
                      </p>
                      <Field label="Neue Dauer" htmlFor="board-share-reset-duration">
                        <select
                          id="board-share-reset-duration"
                          className="select w-full"
                          value={resetMinutes}
                          disabled={resetBusy}
                          onChange={(e) => setResetMinutes(Number(e.target.value))}
                        >
                          {STUDENT_SHARE_DURATION_OPTIONS.map((opt) => (
                            <option key={opt.minutes} value={opt.minutes}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-3 w-full sm:w-auto"
                        loading={resetBusy}
                        disabled={resetBusy}
                        onClick={() => onResetValidity(resetMinutes)}
                      >
                        Neu starten
                      </Button>
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(overlay, portalParent);
};
