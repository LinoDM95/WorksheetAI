import QRCode from 'react-qr-code';
import { X } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui';

type Props = {
  open: boolean;
  title: string;
  studentUrl: string;
  onClose: () => void;
};

export const BoardShareQrModal = ({ open, title, studentUrl, onClose }: Props) => {
  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-share-qr-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        aria-label="Schließen"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="board-share-qr-title" className="text-lg font-semibold text-slate-900">
            Link für Schüler:innen
          </h2>
          <IconButton type="button" aria-label="Schließen" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Scan mit dem Handy — es öffnet sich <strong>nur diese Übung</strong>, ohne Anmeldung und ohne Zugriff
          auf andere Bereiche der App.
        </p>
        <div className="flex justify-center rounded-xl bg-white p-4 ring-1 ring-slate-100">
          <QRCode
            value={studentUrl}
            size={Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 80 : 280)}
            level="M"
            bgColor="#ffffff"
            fgColor="#0f172a"
          />
        </div>
        <p className="mt-3 break-all text-center text-xs text-slate-500" title={studentUrl}>
          {studentUrl}
        </p>
        {title ? (
          <p className="mt-2 truncate text-center text-xs text-slate-400" title={title}>
            {title}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
            Link kopieren
          </Button>
          <Button type="button" onClick={onClose}>
            Fertig
          </Button>
        </div>
      </div>
    </div>
  );
};
