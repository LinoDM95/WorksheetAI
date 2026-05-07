import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/cn';

export type ExplorerListItemMenuCoords = { x: number; y: number };

const MenuDivider = () => <div className="my-1 border-t border-slate-100" role="separator" />;

const MenuButton = ({
  children,
  onClick,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    className={cn(
      'block w-full px-3 py-2 text-left text-[13px] text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    onClick={(e) => {
      e.stopPropagation();
      if (disabled) return;
      onClick();
    }}
  >
    {children}
  </button>
);

export function ExplorerListItemContextMenuPortal({
  coords,
  itemLabel,
  onClose,
  onRename,
  onDuplicate,
  onDelete,
  duplicatePending,
  renamePending,
  deletePending,
  deleteLabel,
}: {
  coords: ExplorerListItemMenuCoords;
  itemLabel: string;
  onClose: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  duplicatePending: boolean;
  renamePending: boolean;
  deletePending: boolean;
  deleteLabel: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const id = window.requestAnimationFrame(() => {
      document.addEventListener('mousedown', onDoc, true);
    });
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('mousedown', onDoc, true);
    };
  }, [onClose]);

  const title = itemLabel || 'Ohne Titel';
  const busy = renamePending || duplicatePending || deletePending;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Kontextmenü: ${title}`}
      style={{ position: 'fixed', left: coords.x, top: coords.y, zIndex: 60 }}
      className="min-w-[220px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
    >
      <MenuButton onClick={onRename} disabled={busy}>
        Titel umbenennen …
      </MenuButton>
      <MenuButton onClick={onDuplicate} disabled={busy}>
        Duplizieren
      </MenuButton>
      <MenuDivider />
      <MenuButton onClick={onDelete} disabled={busy} className="text-red-600 hover:bg-red-50">
        {deleteLabel}
      </MenuButton>
    </div>,
    document.body,
  );
}
