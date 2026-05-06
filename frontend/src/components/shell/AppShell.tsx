import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';
import { CreditsBubble } from './CreditsBubble';
import { Sidebar } from './Sidebar';
import { ShellChromeProvider } from './ShellChromeContext';
import { Topbar, type TopbarProps } from './Topbar';
import { cn } from '../../lib/cn';

/** Desktop-Sidebar (Labels vs. Rail): über Routen hinweg, AppShell mountet pro Route neu. */
const SIDEBAR_DESKTOP_OPEN_KEY = 'worksheetai.shell.sidebarOpenDesktop';

function readDesktopMq(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
}

function readStoredDesktopSidebarOpen(): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SIDEBAR_DESKTOP_OPEN_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

function persistDesktopSidebarOpen(open: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SIDEBAR_DESKTOP_OPEN_KEY, open ? 'true' : 'false');
}

function readInitialSidebarOpen(): boolean {
  const lg = readDesktopMq();
  if (!lg) return false;
  const stored = readStoredDesktopSidebarOpen();
  if (stored !== null) return stored;
  return true;
}

type AppShellProps = {
  /** Wenn gesetzt, wird die Topbar mit diesem Prop-Set gerendert. */
  topbar?: Omit<TopbarProps, 'isLg' | 'sidebarOpen' | 'onMobileMenuOpen' | 'onDesktopSidebarToggle'>;
  /** "fullBleed" entfernt das innere Padding — z. B. für Editor / Wizard. */
  fullBleed?: boolean;
  /**
   * focus: Hauptspalte ohne eigenes Scroll; Kinder (z. B. Split-Editor) scrollen intern.
   * default: gleiche Shell-Höhe; nur `main` scrollt vertikal — Sidebar bleibt links stehen.
   */
  layoutVariant?: 'default' | 'focus';
  children: ReactNode;
};

/**
 * Layout-Wrapper für alle authentifizierten Routen.
 * Sidebar links, Topbar oben, Content rechts.
 * — Unter lg: Sidebar als Overlay-Drawer (Menü öffnen / X / Klick außerhalb / Escape schließen).
 * — Ab lg: Sidebar per Toggle breit (Labels) oder schmale Icon-Leiste — verschwindet nicht vollständig.
 */
export const AppShell = ({ topbar, fullBleed = false, layoutVariant = 'default', children }: AppShellProps) => {
  const [isLg, setIsLg] = useState(readDesktopMq);
  const [sidebarOpen, setSidebarOpen] = useState(readInitialSidebarOpen);
  const location = useLocation();

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onBp = () => {
      const lg = mq.matches;
      setIsLg(lg);
      if (!lg) {
        setSidebarOpen(false);
        return;
      }
      const stored = readStoredDesktopSidebarOpen();
      setSidebarOpen(stored !== null ? stored : true);
    };
    mq.addEventListener('change', onBp);
    return () => mq.removeEventListener('change', onBp);
  }, []);

  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSidebarOpen(false);
      if (window.matchMedia('(min-width: 1024px)').matches) persistDesktopSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const isFocusLayout = layoutVariant === 'focus';

  return (
    <div
      className={cn(
        'flex h-svh max-h-[100dvh] items-stretch overflow-hidden bg-[var(--color-bg-app)] text-slate-800 print:h-auto print:max-h-none print:min-h-0 print:overflow-visible print:bg-white',
      )}
    >
      <Sidebar
        open={sidebarOpen}
        isLg={isLg}
        onClose={() => setSidebarOpen(false)}
        shellVariant={isFocusLayout ? 'focus' : 'default'}
      />
      <div
        className={cn(
          'relative z-0 flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden print:h-auto print:max-h-none print:min-h-0 print:overflow-visible print:w-full',
        )}
      >
        {topbar && (
          <Topbar
            {...topbar}
            actions={
              <>
                {topbar.actions}
                <CreditsBubble />
                <AccountMenu />
              </>
            }
            isLg={isLg}
            sidebarOpen={sidebarOpen}
            onMobileMenuOpen={() => setSidebarOpen(true)}
            onDesktopSidebarToggle={() =>
              setSidebarOpen((o) => {
                const next = !o;
                if (window.matchMedia('(min-width: 1024px)').matches) persistDesktopSidebarOpen(next);
                return next;
              })
            }
          />
        )}
        <ShellChromeProvider breadcrumbs={topbar?.breadcrumbs}>
          <main
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col bg-transparent print:m-0 print:min-h-0 print:w-full print:max-w-none print:flex-none print:overflow-visible print:bg-white print:p-0',
              !fullBleed && 'px-3 py-4 sm:p-6 lg:p-8',
              isFocusLayout && 'overflow-hidden print:overflow-visible',
              !isFocusLayout &&
                'overflow-y-auto overflow-x-hidden overscroll-contain print:overflow-visible',
            )}
          >
            {children}
          </main>
        </ShellChromeProvider>
      </div>
    </div>
  );
};
