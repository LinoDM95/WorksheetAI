import { createPortal } from 'react-dom';
import { QRCode } from 'react-qr-code';
import { X } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui';
import { formatDate } from '../../../lib/formatDate';

type Props = {
  open: boolean;
  title: string;
  studentUrl: string;
  /** ISO; wenn gesetzt, wird Gültigkeit bis … angezeigt */
  expiresAt?: string | null;
  onClose: () => void;
};

export const BoardShareQrModal = ({ open, title, studentUrl, expiresAt, onClose }: Props) => {
  if (!open || typeof document === 'undefined') return null;

  const qrSize =
    typeof window !== 'undefined' ? Math.min(400, Math.max(280, window.innerWidth - 48)) : 320;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
    } catch {
      /* ignore */
    }
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-share-qr-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        aria-label="Schließen"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[min(92dvh,900px)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
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
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
            Gültig bis: <strong>{formatDate(expiresAt)}</strong>
          </p>
        ) : (
          <p className="mb-4 text-sm text-slate-500">
            Es ist immer ein Ablaufdatum gesetzt (maximal 3 Tage). Du kannst den Schüler-Link danach erneut aktivieren.
          </p>
        )}
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
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};
