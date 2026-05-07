import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, FileText, Book, Share2, Presentation, X, Shield } from 'lucide-react';
import { Logo } from '../Logo';
import { cn } from '../../lib/cn';
import { useAuth } from '../../lib/authContext';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  /** Eintrag ohne Navigation (z. B. noch nicht freigeschaltet). */
  disabled?: boolean;
  /** Match-Pfad-Präfix (für active-State über mehrere Routen). */
  matchPrefix?: string;
};

const PRIMARY_NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: Home },
  { to: '/app/worksheets', label: 'Meine Arbeitsblätter', icon: FileText, matchPrefix: '/app/worksheets' },
  { to: '/app/boards', label: 'Smartboard', icon: Presentation, matchPrefix: '/app/boards' },
];

const COMMUNITY_NAV: NavItem[] = [
  { to: '/app/boards/library', label: 'Bibliothek', icon: Share2, matchPrefix: '/app/boards/library' },
];

type SidebarProps = {
  open: boolean;
  /** Ab lg: Sidebar ist eine normale Spalte (kein Overlay). */
  isLg: boolean;
  onClose: () => void;
  /** focus: volle Shell-Höhe + intern scrollen (Editor-Layout). */
  shellVariant?: 'default' | 'focus';
};

export const Sidebar = ({ open, isLg, onClose, shellVariant = 'default' }: SidebarProps) => {
  const { user } = useAuth();
  const drawerMode = !isLg;
  /** Desktop: eingeklappt = schmale Leiste nur mit Icons (nicht width 0). */
  const railMode = !drawerMode && !open;

  return (
    <>
      {drawerMode && (
        <AnimatePresence>
          {open ? (
            <motion.button
              key="sidebar-overlay"
              type="button"
              aria-label="Seitenleiste schließen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
              className="no-print fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
              onClick={onClose}
            />
          ) : null}
        </AnimatePresence>
      )}
      <aside
        className={cn(
          'no-print flex shrink-0 flex-col border-slate-200 bg-white border-r',
          drawerMode &&
            'fixed inset-y-0 left-0 z-50 w-[min(15rem,85vw)] max-w-[min(15rem,85vw)] px-3.5 py-4 transition-[transform] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none motion-reduce:duration-0',
          drawerMode && (open ? 'translate-x-0 shadow-xl' : '-translate-x-full'),
          !drawerMode &&
            cn(
              'relative z-auto translate-x-0 lg:sticky lg:top-0 lg:h-svh lg:max-h-[100dvh] lg:self-start',
              shellVariant === 'focus' && 'z-10',
              'min-h-0 overscroll-contain transition-[width,padding-inline] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none motion-reduce:duration-0',
              railMode
                ? 'w-[4.5rem] shrink-0 overflow-x-hidden overflow-y-auto px-2 py-4'
                : 'w-[15rem] shrink-0 overflow-x-hidden overflow-y-auto px-3.5 py-4',
            ),
        )}
        aria-label="Hauptnavigation"
        inert={drawerMode && !open ? true : undefined}
      >
        <div
          className={cn(
            'flex items-center pb-3 pt-1',
            drawerMode && 'justify-between px-1',
            !drawerMode && open && 'justify-between px-1',
            railMode && 'justify-center px-0',
          )}
        >
          <Logo compact={railMode} />
          {drawerMode && open && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="Menü schließen"
              onClick={onClose}
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>

        <SectionLabel rail={railMode}>Arbeitsbereich</SectionLabel>
        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavItemLink
              key={item.to}
              item={item}
              railMode={railMode}
              onNavigate={() => drawerMode && onClose()}
            />
          ))}
        </nav>

        <SectionLabel rail={railMode}>Community</SectionLabel>
        <nav className="flex flex-col gap-0.5">
          {COMMUNITY_NAV.map((item) => (
            <NavItemLink
              key={item.to}
              item={item}
              railMode={railMode}
              onNavigate={() => drawerMode && onClose()}
            />
          ))}
        </nav>

        {user?.is_staff ? (
          <>
            <SectionLabel rail={railMode}>Administration</SectionLabel>
            <nav className="flex flex-col gap-0.5">
              <NavItemLink
                item={{
                  to: '/app/curricula',
                  label: 'Lehrpläne',
                  icon: Book,
                  matchPrefix: '/app/curricula',
                }}
                railMode={railMode}
                onNavigate={() => drawerMode && onClose()}
              />
              <NavItemLink
                item={{
                  to: '/app/backoffice',
                  label: 'Backoffice',
                  icon: Shield,
                  matchPrefix: '/app/backoffice',
                }}
                railMode={railMode}
                onNavigate={() => drawerMode && onClose()}
              />
            </nav>
          </>
        ) : null}

        <div className="flex-1" />
      </aside>
    </>
  );
};

const SectionLabel = ({ children, rail }: { children: string; rail?: boolean }) => (
  <div className={cn('px-1.5', rail ? 'mt-2' : 'mt-4')}>
    {rail ? <span className="sr-only">{children}</span> : null}
    <div
      className={cn(
        'overflow-hidden transition-[opacity,max-height,margin] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none motion-reduce:duration-0',
        rail ? 'pointer-events-none max-h-0 opacity-0' : 'max-h-10 opacity-100',
      )}
      aria-hidden={rail}
    >
      <div className="pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">{children}</div>
    </div>
    <div
      className={cn(
        'mx-auto shrink-0 bg-slate-200 transition-[width,height,margin,opacity] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none motion-reduce:duration-0',
        rail ? 'mt-1 h-px w-9 opacity-100' : 'h-0 w-0 opacity-0',
      )}
      aria-hidden
    />
  </div>
);

const NavItemLink = ({
  item,
  railMode,
  onNavigate,
}: {
  item: NavItem;
  railMode: boolean;
  onNavigate: () => void;
}) => {
  const Icon = item.icon;
  const { pathname } = useLocation();
  const suppressSmartboardActive =
    item.to === '/app/boards' && pathname.startsWith('/app/boards/library');

  const railCls = railMode && '!justify-center gap-0 px-2 py-2.5 [&_.icon]:mx-auto';

  const labelSpan = (muted?: boolean) => (
    <span
      className={cn(
        'min-w-0 overflow-hidden truncate text-left transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none motion-reduce:duration-0',
        railMode ? 'max-w-0 opacity-0' : 'max-w-[min(12rem,calc(15rem-4rem))] flex-1 opacity-100',
        muted && 'text-slate-500',
      )}
    >
      {item.label}
    </span>
  );

  if (item.disabled) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          'nav-item !cursor-not-allowed opacity-45 saturate-[0.65]',
          'hover:!border-transparent hover:!bg-transparent',
          railCls,
        )}
        aria-label={`${item.label} — demnächst verfügbar`}
        title={`${item.label} — demnächst verfügbar`}
      >
        <Icon size={railMode ? 19 : 17} className="icon !text-slate-400 shrink-0" aria-hidden />
        {labelSpan(true)}
      </button>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={!item.matchPrefix}
      onClick={() => onNavigate()}
      title={railMode ? item.label : undefined}
      aria-label={railMode ? item.label : undefined}
      className={({ isActive }) =>
        cn('nav-item', railCls, isActive && !suppressSmartboardActive && 'active')
      }
    >
      <Icon size={railMode ? 19 : 17} className="icon shrink-0" aria-hidden />
      {labelSpan()}
    </NavLink>
  );
};
