import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  PlusSquare,
  FileText,
  LayoutGrid,
  Book,
  Share2,
  Settings,
  ChevronDown,
  Plus,
  X,
} from 'lucide-react';
import { Logo } from '../Logo';
import { Avatar } from '../Avatar';
import { cn } from '../../lib/cn';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  /** Mockup-Hinweis: Backend fehlt komplett. */
  mock?: boolean;
  /** Match-Pfad-Präfix (für active-State über mehrere Routen). */
  matchPrefix?: string;
};

const PRIMARY_NAV: NavItem[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: Home },
  { to: '/app/create', label: 'Arbeitsblatt erstellen', icon: PlusSquare },
  { to: '/app/worksheets', label: 'Meine Arbeitsblätter', icon: FileText, matchPrefix: '/app/worksheets' },
  { to: '/app/patterns', label: 'Vorlagen', icon: LayoutGrid, matchPrefix: '/app/patterns' },
];

const SCHOOL_NAV: NavItem[] = [
  { to: '/app/curriculum', label: 'Lehrpläne', icon: Book, mock: true },
  { to: '/app/library', label: 'Bibliothek & Teilen', icon: Share2, mock: true },
  { to: '/app/settings', label: 'Einstellungen', icon: Settings, mock: true },
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
  const navigate = useNavigate();
  const drawerMode = !isLg;

  return (
    <>
      {open && drawerMode && (
        <button
          type="button"
          aria-label="Seitenleiste schließen"
          className="no-print fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'no-print flex shrink-0 flex-col border-slate-200 bg-white transition-[width,transform] duration-200 ease-out',
          'border-r',
          drawerMode &&
            'fixed inset-y-0 left-0 z-50 w-60 max-w-[min(15rem,85vw)] px-3.5 py-4',
          drawerMode && (open ? 'translate-x-0 shadow-xl' : '-translate-x-full'),
          !drawerMode &&
            cn(
              'relative z-auto min-w-0 translate-x-0 self-stretch',
              shellVariant === 'focus' && 'relative z-10',
              'h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain',
            ),
          !drawerMode && open && 'w-60 overflow-visible px-3.5 py-4',
          !drawerMode && !open && 'w-0 overflow-hidden border-transparent p-0',
        )}
        aria-label="Hauptnavigation"
        inert={!drawerMode && !open ? true : undefined}
      >
        <div
          className={cn(
            'flex items-center justify-between px-1 pb-3 pt-1',
            !drawerMode && !open && 'pointer-events-none opacity-0',
          )}
        >
          <Logo />
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

        <button
          type="button"
          onClick={() => {
            navigate('/app/create');
            if (drawerMode) onClose();
          }}
          className="btn btn-primary mt-1 w-full justify-start"
        >
          <Plus size={16} aria-hidden /> Neues Arbeitsblatt
        </button>

        <SectionLabel>Arbeitsbereich</SectionLabel>
        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavItemLink key={item.to} item={item} onNavigate={() => drawerMode && onClose()} />
          ))}
        </nav>

        <SectionLabel>Schule</SectionLabel>
        <nav className="flex flex-col gap-0.5">
          {SCHOOL_NAV.map((item) => (
            <NavItemLink key={item.to} item={item} onNavigate={() => drawerMode && onClose()} />
          ))}
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          className="flex items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50"
          aria-label="Profil-Menü öffnen (Mockup)"
          title="Profil-Menü (Mockup — kein Backend)"
        >
          <Avatar name="M Krüger" size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-slate-900">M. Krüger</div>
            <div className="truncate text-[11.5px] text-slate-500">Goethe-Gymnasium</div>
          </div>
          <ChevronDown size={14} className="text-slate-400" aria-hidden />
        </button>
      </aside>
    </>
  );
};

const SectionLabel = ({ children }: { children: string }) => (
  <div className="mt-4 px-1.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">
    {children}
  </div>
);

const NavItemLink = ({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={!item.matchPrefix}
      onClick={() => onNavigate()}
      className={({ isActive }) => cn('nav-item', isActive && 'active')}
      aria-disabled={item.mock || undefined}
      title={item.mock ? `${item.label} — Mockup, noch nicht funktional` : undefined}
    >
      <Icon size={17} className="icon" aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {item.mock && (
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800">
          Mock
        </span>
      )}
    </NavLink>
  );
};
