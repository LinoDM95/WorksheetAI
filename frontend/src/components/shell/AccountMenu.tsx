import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { Avatar } from '../Avatar';
import { cn } from '../../lib/cn';
import { useAuth } from '../../lib/authContext';

type MenuPos = { top: number; left: number; width: number };

export const AccountMenu = () => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email || 'Konto';

  const updateMenuPos = useCallback(() => {
    const el = btnRef.current;
    if (!el || !open) {
      setMenuPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(280, vw - 16);
    let left = r.right - width;
    if (left < 8) left = 8;
    if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);
    setMenuPos({
      top: r.bottom + 6,
      left,
      width,
    });
  }, [open]);

  useLayoutEffect(() => {
    updateMenuPos();
  }, [updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updateMenuPos();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    setOpen(false);
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          'flex items-center gap-2 rounded-xl border px-2 py-1.5 transition',
          open ? 'border-slate-200 bg-slate-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Konto und Einstellungen"
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={displayName} size={32} />
        <ChevronDown
          size={14}
          className={cn('hidden text-slate-500 transition sm:block', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && menuPos ? (
        <div
          role="menu"
          aria-label="Konto"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxWidth: 'calc(100vw - 1rem)',
            zIndex: 60,
          }}
          className="rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="truncate text-[13px] font-semibold text-slate-900">{displayName}</div>
            {user?.email ? <div className="truncate text-[11px] text-slate-500">{user.email}</div> : null}
          </div>
          <Link
            role="menuitem"
            to="/app/settings"
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} className="shrink-0 text-slate-500" aria-hidden />
            Einstellungen
          </Link>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            onClick={() => void handleLogout()}
          >
            <LogOut size={16} className="shrink-0 text-slate-500" aria-hidden />
            Abmelden
          </button>
        </div>
      ) : null}
    </div>
  );
};
