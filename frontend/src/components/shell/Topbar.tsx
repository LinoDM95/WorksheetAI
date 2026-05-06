import { ChevronRight, Menu, PanelLeft, PanelLeftClose } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type TopbarProps = {
  title?: string;
  subtitle?: string;
  breadcrumbs?: string[];
  actions?: ReactNode;
  /** Ab lg-Viewport: Seitenleiste ein-/ausblenden. */
  isLg: boolean;
  sidebarOpen: boolean;
  onMobileMenuOpen: () => void;
  onDesktopSidebarToggle: () => void;
  className?: string;
};

export const Topbar = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  isLg,
  sidebarOpen,
  onMobileMenuOpen,
  onDesktopSidebarToggle,
  className,
}: TopbarProps) => (
  <header
    className={cn(
      'no-print sticky top-0 z-30 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 sm:gap-4 sm:px-6 lg:px-7',
      className,
    )}
  >
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {isLg ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon shrink-0"
          aria-label={
            sidebarOpen ? 'Seitenleiste einklappen (nur Symbole)' : 'Seitenleiste ausklappen (mit Beschriftungen)'
          }
          aria-expanded={sidebarOpen}
          onClick={onDesktopSidebarToggle}
        >
          {sidebarOpen ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeft size={18} strokeWidth={1.75} />}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon shrink-0"
          aria-label="Menü öffnen"
          aria-expanded={sidebarOpen}
          onClick={onMobileMenuOpen}
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
      )}
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="mb-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            {breadcrumbs.map((crumb, i) => (
              <span key={`${crumb}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight size={12} aria-hidden />}
                <span
                  className={cn(
                    'truncate',
                    i === breadcrumbs.length - 1 ? 'font-semibold text-slate-700' : 'font-medium',
                  )}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        )}
        {title && (
          <div className="flex items-baseline gap-3">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
            {subtitle && (
              <span className="hidden truncate text-sm text-slate-500 md:inline">{subtitle}</span>
            )}
          </div>
        )}
      </div>
    </div>

    <div className="flex shrink-0 items-center gap-2">{actions}</div>
  </header>
);
