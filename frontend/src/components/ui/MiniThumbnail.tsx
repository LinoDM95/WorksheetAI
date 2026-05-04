import { cn } from '../../lib/cn';

export type MiniThumbnailProps = {
  size?: 'sm' | 'md';
  /** Mit `responsive` wird sie auf <sm versteckt (Listen-Spalten). */
  responsive?: boolean;
  className?: string;
};

/**
 * Mini-Vorschau (Mockup) für Listen / Karten — ein Layout für alle Stellen.
 */
export const MiniThumbnail = ({ size = 'md', responsive = false, className }: MiniThumbnailProps) => (
  <div
    className={cn(
      'shrink-0 rounded-[3px] border border-slate-300 bg-white shadow-[var(--shadow-xs)]',
      size === 'md' ? 'h-11 w-9 p-1.5' : 'h-10 w-8 p-1',
      responsive && 'hidden sm:block',
      className,
    )}
    aria-hidden
    title="Mini-Thumbnail (Mockup — echte Vorschau folgt)"
  >
    <div className="mb-0.5 h-0.5 rounded-[1px] bg-slate-300" />
    <div className="mb-0.5 h-0.5 rounded-[1px] bg-slate-300" />
    <div className="mb-1.5 h-0.5 w-3/5 rounded-[1px] bg-slate-300" />
    <div className="mb-0.5 h-0.5 rounded-[1px] bg-slate-300" />
    <div className="h-0.5 w-2/3 rounded-[1px] bg-slate-300" />
  </div>
);
