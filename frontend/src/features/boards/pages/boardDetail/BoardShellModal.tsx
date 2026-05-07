import { createPortal } from 'react-dom';
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../../../../components/ui';
import { cn } from '../../../../lib/cn';

export function BoardShellModal({
  open,
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        aria-label="Schließen"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[min(92dvh,920px)] w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl',
          wide ? 'max-w-5xl' : 'max-w-lg',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-900">{title}</h2>
          <IconButton type="button" variant="ghost" size="sm" aria-label="Schließen" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-slate-100 px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
