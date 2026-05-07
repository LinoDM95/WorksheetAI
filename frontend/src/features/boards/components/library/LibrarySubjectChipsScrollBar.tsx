import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../../../../components/ui';
import { cn } from '../../../../lib/cn';

const DRAG_CLICK_BLOCK_MS = 380;
const DRAG_THRESHOLD_PX = 8;

type Props = {
  filterLabels: readonly string[];
  subjectFilter: string;
  onSubjectFilterChange: (next: string) => void;
  ariaLabelledBy: string;
};

export function LibrarySubjectChipsScrollBar({
  filterLabels,
  subjectFilter,
  onSubjectFilterChange,
  ariaLabelledBy,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const blockedClickUntilRef = useRef(0);
  const dragRef = useRef({ active: false, pointerId: -1, startX: 0, scrollStart: 0 });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const refreshEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const sl = el.scrollLeft;
    setCanPrev(sl > 2);
    setCanNext(sl < maxScroll - 2);
  }, []);

  const scrollAmount = useCallback(() => {
    const el = trackRef.current;
    if (!el) return Math.round(Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.35 : 280, 280));
    return Math.round(Math.min(el.clientWidth * 0.65, 320));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    refreshEdges();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refreshEdges) : null;
    ro?.observe(el);
    el.addEventListener('scroll', refreshEdges, { passive: true });
    window.addEventListener('resize', refreshEdges);
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', refreshEdges);
      window.removeEventListener('resize', refreshEdges);
    };
  }, [refreshEdges]);

  useEffect(() => {
    refreshEdges();
  }, [refreshEdges, filterLabels]);

  const scrollDir = useCallback(
    (dir: -1 | 1) => {
      const el = trackRef.current;
      if (!el) return;
      el.scrollBy({ left: dir * scrollAmount(), behavior: 'smooth' });
    },
    [scrollAmount],
  );

  const guardedChipClick = (token: string) => {
    if (Date.now() < blockedClickUntilRef.current) return;
    if (token === '') {
      onSubjectFilterChange('');
      return;
    }
    onSubjectFilterChange(subjectFilter === token ? '' : token);
  };

  const onTrackPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('button')) return;
    const el = trackRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      scrollStart: el.scrollLeft,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /**/
    }
  };

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const el = trackRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) {
      blockedClickUntilRef.current = Date.now() + DRAG_CLICK_BLOCK_MS;
      e.preventDefault();
    }
    el.scrollLeft = dragRef.current.scrollStart - dx;
    refreshEdges();
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const el = trackRef.current;
    dragRef.current.active = false;
    if (el) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /**/
      }
    }
    refreshEdges();
  };

  const handleTrackKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    const step = scrollAmount();
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      el.scrollBy({ left: -step, behavior: 'smooth' });
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      el.scrollBy({ left: step, behavior: 'smooth' });
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      el.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      el.scrollTo({ left: el.scrollWidth - el.clientWidth, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
      <IconButton
        type="button"
        variant="secondary"
        size="sm"
        className={cn('!h-8 !w-8 shrink-0 sm:!h-9 sm:!w-9', !canPrev && 'pointer-events-none opacity-35')}
        aria-label="Fächerfilter nach links blättern"
        onClick={() => scrollDir(-1)}
      >
        <ChevronLeft size={18} strokeWidth={2.25} aria-hidden />
      </IconButton>

      <div
        ref={trackRef}
        role="group"
        aria-labelledby={ariaLabelledBy}
        tabIndex={0}
        onPointerDownCapture={onTrackPointerDownCapture}
        onPointerMove={onTrackPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={refreshEdges}
        onKeyDown={handleTrackKeyDown}
        className={cn(
          'flex min-h-[2.25rem] min-w-0 flex-1 cursor-grab select-none gap-1 overflow-x-auto pb-px [scrollbar-width:none] active:cursor-grabbing sm:min-h-[2.375rem] sm:gap-1.5 [&::-webkit-scrollbar]:hidden',
          'touch-pan-x outline-none ring-offset-[var(--color-bg-card)] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={() => guardedChipClick('')}
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
            !subjectFilter
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200/80',
          )}
        >
          Alle
        </button>
        {filterLabels.map((subj) => (
          <button
            key={subj}
            type="button"
            tabIndex={-1}
            title={subj}
            onClick={() => guardedChipClick(subj)}
            className={cn(
              'max-w-[13rem] shrink-0 truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
              subjectFilter === subj
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200/80',
            )}
          >
            {subj}
          </button>
        ))}
      </div>

      <IconButton
        type="button"
        variant="secondary"
        size="sm"
        className={cn('!h-8 !w-8 shrink-0 sm:!h-9 sm:!w-9', !canNext && 'pointer-events-none opacity-35')}
        aria-label="Fächerfilter nach rechts blättern"
        onClick={() => scrollDir(1)}
      >
        <ChevronRight size={18} strokeWidth={2.25} aria-hidden />
      </IconButton>
    </div>
  );
}
