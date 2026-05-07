import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { MobileWorkspaceTabs, type WorkspaceMobileTab } from '../shell/MobileWorkspaceTabs';
import { cn } from '../../lib/cn';

type WorkspaceExplorerFrameProps = {
  mobileTab: WorkspaceMobileTab;
  onMobileTabChange: (value: WorkspaceMobileTab) => void;
  contentDisabled?: boolean;
  isLg: boolean;
  sidebarDragging?: boolean;
  sidebar: ReactNode;
  children: ReactNode;
};

export function WorkspaceExplorerFrame({
  mobileTab,
  onMobileTabChange,
  contentDisabled,
  isLg,
  sidebarDragging,
  sidebar,
  children,
}: WorkspaceExplorerFrameProps) {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <MobileWorkspaceTabs value={mobileTab} onChange={onMobileTabChange} contentDisabled={contentDisabled} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside
          className={cn(
            'no-print flex shrink-0 flex-col border-slate-200 bg-[var(--color-bg-card)] lg:w-[min(100%,300px)] lg:max-w-[340px] lg:border-r lg:border-b-0',
            'border-b',
            sidebarDragging && 'select-none',
            !isLg && mobileTab !== 'list' && 'hidden',
            !isLg && mobileTab === 'list' && 'min-h-0 flex-1',
            'lg:flex lg:max-h-none',
          )}
        >
          {sidebar}
        </aside>
        <section
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg-app)] lg:min-h-0 print:bg-white',
            !isLg && mobileTab !== 'content' && 'hidden print:flex',
          )}
        >
          {children}
        </section>
      </div>
    </div>
  );
}

type WorkspaceExplorerToolbarProps = {
  children: ReactNode;
};

/** Kopfzeile der Explorer-Spalte (Ordner, Neueintrag, Suche) — Smartboards und Arbeitsblätter. */
export function WorkspaceExplorerToolbar({ children }: WorkspaceExplorerToolbarProps) {
  return (
    <div className="shrink-0 space-y-2 border-b border-slate-100 p-2">
      <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap">{children}</div>
    </div>
  );
}

type WorkspaceExplorerGalerieHintProps = {
  hint: ReactNode;
};

export function WorkspaceExplorerGalerieHint({ hint }: WorkspaceExplorerGalerieHintProps) {
  return (
    <div className="px-1 pb-2">
      <NavLink
        to="."
        end
        className={({ isActive }) =>
          cn(
            'block rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
            isActive ? 'bg-indigo-50 text-indigo-900' : 'text-slate-500 hover:bg-slate-50',
          )
        }
      >
        Galerie
      </NavLink>
      <div className="mt-1 px-2 text-[10px] leading-snug text-slate-400">{hint}</div>
    </div>
  );
}

export function WorkspaceExplorerListScroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2">{children}</div>;
}

export function WorkspaceExplorerSectionRule() {
  return <div className="my-2 border-t border-slate-100" />;
}
