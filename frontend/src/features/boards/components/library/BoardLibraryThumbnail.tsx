import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../../lib/cn';
import {
  boardStageClipBoxStyle,
  boardStageScaledInnerStyle,
  STAGE_BASE_W,
  STAGE_BASE_H,
  useBoardStageScale,
} from '../../boardStageLayout';
import { FreeHtmlBoardFrame } from '../free-html/FreeHtmlBoardFrame';
import type { DatasetId, LibraryId } from '../../types';

type Props = {
  boardId: string;
  html: string;
  css: string;
  javascript: string;
  usedLibraries: LibraryId[];
  usedDatasets?: DatasetId[];
  /** compact = Raster; storefront = hohes Poster (Marktplatz-Karten) */
  density?: 'comfortable' | 'compact' | 'storefront';
};

export const BoardLibraryThumbnail = ({
  boardId,
  html,
  css,
  javascript,
  usedLibraries,
  usedDatasets,
  density = 'comfortable',
}: Props) => {
  const outerRef = useRef<HTMLDivElement>(null);
  /** Kartenraster / Storefront: ohne Lazy Load — IO + winzige Box führten zu weißen/leeren Thumbnails. */
  const eager = density === 'compact' || density === 'storefront';
  const [inView, setInView] = useState(eager);
  const stageScale = useBoardStageScale(
    outerRef,
    STAGE_BASE_W,
    STAGE_BASE_H,
    `${boardId}-${inView}`,
    eager ? 'cover' : 'contain',
  );

  useEffect(() => {
    if (eager) return;
    const el = outerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setInView(true);
        obs.disconnect();
      },
      { root: null, rootMargin: '320px 0px', threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [eager]);

  return (
    <div
      ref={outerRef}
      className={cn(
        'relative min-h-[5.5rem] w-full shrink-0 overflow-hidden',
        eager ? 'bg-white' : 'bg-slate-200/70',
        density === 'compact' && 'h-[9.5rem] sm:h-[11rem]',
        density === 'storefront' && 'h-[11rem] sm:h-[12.5rem] md:h-[13.5rem]',
        density === 'comfortable' && 'aspect-video',
      )}
      aria-hidden
    >
      {!inView ? (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-indigo-100/40" />
      ) : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white">
          <div className="bg-transparent" style={boardStageClipBoxStyle(stageScale)}>
            <div style={boardStageScaledInnerStyle(stageScale)}>
              <FreeHtmlBoardFrame
                html={html}
                css={css}
                javascript={javascript}
                scriptsEnabled={false}
                frozenPreview
                hideScriptsDisabledNotice
                reloadKey={0}
                boardFrameId={`library-thumb-${boardId}`}
                usedLibraries={usedLibraries}
                usedDatasets={usedDatasets}
                fillHeight
                fitContainer
                className="pointer-events-none !h-full !min-h-0 !rounded-none !shadow-none !ring-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
