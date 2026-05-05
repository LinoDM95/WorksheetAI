import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';

export const RESIZABLE_DOCK_RAIL_W_PX = 44;
const LG_QUERY = '(min-width: 1024px)';

export type UseResizableEditorDockOptions = {
  widthStorageKey: string;
  collapsedStorageKey: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  /** Wenn gesetzt, überschreibt Lesen aus collapsedStorageKey beim ersten Render */
  initialCollapsed?: boolean;
};

export type ResizableEditorDockModel = {
  isLgViewport: boolean;
  width: number;
  setWidth: React.Dispatch<React.SetStateAction<number>>;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  resizing: boolean;
  asideStyle: CSSProperties;
  minWidth: number;
  maxWidth: number;
  onResizeMouseDown: (e: MouseEvent) => void;
  onResizeKeyDown: (e: KeyboardEvent) => void;
};

const readWidth = (key: string, min: number, max: number, def: number): number => {
  if (typeof window === 'undefined') return def;
  const raw = localStorage.getItem(key);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};

const readCollapsed = (key: string, initial?: boolean): boolean => {
  if (initial !== undefined) return initial;
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(key) === '1';
};

export function useResizableEditorDock(opts: UseResizableEditorDockOptions): ResizableEditorDockModel {
  const minW = opts.minWidth ?? 280;
  const maxW = opts.maxWidth ?? 560;
  const defW = opts.defaultWidth ?? 360;

  const [isLgViewport, setIsLgViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(LG_QUERY).matches,
  );
  const [width, setWidth] = useState(() => readWidth(opts.widthStorageKey, minW, maxW, defW));
  const [collapsed, setCollapsed] = useState(() => readCollapsed(opts.collapsedStorageKey, opts.initialCollapsed));
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef<{ clientX: number; w: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(LG_QUERY);
    const apply = () => setIsLgViewport(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(opts.widthStorageKey, String(width));
    } catch {
      /* ignore */
    }
  }, [opts.widthStorageKey, width]);

  useEffect(() => {
    try {
      localStorage.setItem(opts.collapsedStorageKey, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [opts.collapsedStorageKey, collapsed]);

  useEffect(() => {
    if (!resizing) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [resizing]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: globalThis.MouseEvent) => {
      const st = resizeStartRef.current;
      if (!st) return;
      const next = Math.min(maxW, Math.max(minW, st.w + (st.clientX - e.clientX)));
      setWidth(next);
    };
    const onUp = () => {
      resizeStartRef.current = null;
      setResizing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, minW, maxW]);

  const onResizeMouseDown = (e: MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    resizeStartRef.current = { clientX: e.clientX, w: width };
    setResizing(true);
  };

  const onResizeKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 32 : 12;
    const delta = e.key === 'ArrowLeft' ? step : -step;
    setWidth((w) => Math.min(maxW, Math.max(minW, w + delta)));
  };

  return {
    isLgViewport,
    width,
    setWidth,
    collapsed,
    setCollapsed,
    resizing,
    asideStyle: { width: collapsed ? RESIZABLE_DOCK_RAIL_W_PX : width },
    minWidth: minW,
    maxWidth: maxW,
    onResizeMouseDown,
    onResizeKeyDown,
  };
}
