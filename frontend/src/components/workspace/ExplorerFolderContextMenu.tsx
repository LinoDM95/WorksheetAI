import { createPortal } from 'react-dom';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type ExplorerFolderMenuCoords = { x: number; y: number };

export function ExplorerFolderContextMenuPortal({
  coords,
  onClose,
  onRename,
  onNewSubfolder,
  onDelete,
}: {
  coords: ExplorerFolderMenuCoords;
  onClose: () => void;
  onRename: () => void;
  onNewSubfolder: () => void;
  onDelete: () => void;
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

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', left: coords.x, top: coords.y, zIndex: 60 }}
      className="min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
    >
      <MenuButton onClick={onNewSubfolder}>Neuer Unterordner</MenuButton>
      <MenuButton onClick={onRename}>Umbenennen …</MenuButton>
      <MenuButton onClick={onDelete} className="text-red-600 hover:bg-red-50">
        Ordner löschen …
      </MenuButton>
    </div>,
    document.body,
  );
}

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
