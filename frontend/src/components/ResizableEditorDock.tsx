import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './ui';
import { cn } from '../lib/cn';
import type { ResizableEditorDockModel } from '../lib/useResizableEditorDock';

export type ResizableEditorDockProps = {
  ariaLabel: string;
  title: ReactNode;
  dock: ResizableEditorDockModel;
  expanded: ReactNode;
  /** Optional zusätzliche Steuerung in eingeklapptem Zustand (z. B. Schnellaktion). */
  collapsedRail?: ReactNode;
  asideClassName?: string;
};

export function ResizableEditorDock({
  ariaLabel,
  title,
  dock,
  expanded,
  collapsedRail,
  asideClassName,
}: ResizableEditorDockProps) {
  const { collapsed, setCollapsed, resizing, asideStyle, onResizeMouseDown, onResizeKeyDown } = dock;

  return (
    <aside
      className={cn(
        'no-print relative flex h-full min-h-0 shrink-0 flex-col border-l border-slate-200 bg-white shadow-sm',
        asideClassName,
      )}
      style={asideStyle}
      aria-label={ariaLabel}
    >
      {!collapsed ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            aria-label="Breite der Leiste anpassen"
            className={cn(
              'absolute left-0 top-0 z-20 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none',
              'hover:bg-indigo-500/10 outline-none focus-visible:bg-indigo-500/15 focus-visible:ring-2 focus-visible:ring-indigo-400',
              resizing && 'bg-indigo-500/20',
            )}
            onMouseDown={onResizeMouseDown}
            onKeyDown={onResizeKeyDown}
          />
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 py-2 pl-4 pr-2">
            <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Leiste einklappen"
              title="Leiste einklappen"
              onClick={() => setCollapsed(true)}
            >
              <ChevronRight size={18} aria-hidden />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3">{expanded}</div>
        </>
      ) : (
        <div className="flex h-full min-h-0 flex-col items-center gap-1 bg-slate-50/90 py-2">
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-label="Leiste ausklappen"
            title="Leiste ausklappen"
            onClick={() => setCollapsed(false)}
          >
            <ChevronLeft size={18} aria-hidden />
          </IconButton>
          {collapsedRail != null ? (
            <>
              <span className="my-0.5 h-px w-7 shrink-0 bg-slate-200" aria-hidden />
              {collapsedRail}
            </>
          ) : null}
        </div>
      )}
    </aside>
  );
}
