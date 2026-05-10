import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { A4WorksheetRenderer } from './A4WorksheetRenderer';
import type { PageSetup, Worksheet } from '../../types';
import { cn } from '../../lib/cn';
import {
  boardStageClipBoxStyle,
  boardStageScaledInnerStyle,
  useBoardStageScale,
} from '../boards/boardStageLayout';

const MM_TO_PX = 96 / 25.4;

const fallbackPageSetup = (): PageSetup => ({
  format: 'A4',
  orientation: 'portrait',
  unit: 'mm',
  width_mm: 210,
  height_mm: 297,
  margins_mm: { top: 20, right: 15, bottom: 20, left: 15 },
  safe_area: { x_mm: 0, y_mm: 0, width_mm: 180, height_mm: 257 },
  renderer: 'html',
});

function pageSetupToBasePx(pageSetup: PageSetup | null | undefined): { w: number; h: number } {
  const wMm = pageSetup?.width_mm ?? 210;
  const hMm = pageSetup?.height_mm ?? 297;
  return { w: wMm * MM_TO_PX, h: hMm * MM_TO_PX };
}

type Props = {
  worksheetId: string;
  pageSetup?: PageSetup | null;
  thumbnailRenderModel: Record<string, unknown> | null | undefined;
  density?: 'comfortable' | 'compact' | 'storefront';
  className?: string;
};

export function WorksheetCardThumbnail({
  worksheetId,
  pageSetup,
  thumbnailRenderModel,
  density = 'comfortable',
  className,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const resolvedSetup =
    pageSetup &&
    typeof pageSetup === 'object' &&
    pageSetup.width_mm != null &&
    pageSetup.height_mm != null
      ? pageSetup
      : fallbackPageSetup();
  const { w: baseW, h: baseH } = pageSetupToBasePx(resolvedSetup);
  const eager = density === 'compact' || density === 'storefront';
  const [inView, setInView] = useState(eager);
  const stageScale = useBoardStageScale(
    outerRef,
    baseW,
    baseH,
    `${worksheetId}-${inView}`,
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

  const thumbWorksheet: Worksheet = {
    id: worksheetId,
    title: ' ',
    subject: '',
    grade: null,
    topic: '',
    page_setup: resolvedSetup,
    content: {},
    render_model: thumbnailRenderModel ?? {},
  };

  const hasThumb = Boolean(thumbnailRenderModel && Object.keys(thumbnailRenderModel).length > 0);
  const showPreview = inView && hasThumb;

  return (
    <div
      ref={outerRef}
      className={cn(
        'relative min-h-[5.5rem] w-full shrink-0 overflow-hidden',
        eager ? 'bg-white' : 'bg-slate-200/70',
        density === 'compact' && 'h-[9.5rem] sm:h-[11rem]',
        density === 'storefront' && 'h-[11rem] sm:h-[12.5rem] md:h-[13.5rem]',
        density === 'comfortable' && 'aspect-[16/10]',
        className,
      )}
      aria-hidden
    >
      {!showPreview ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50">
          <FileText className="h-12 w-12 text-slate-300" strokeWidth={1.25} aria-hidden />
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white">
          <div className="bg-transparent" style={boardStageClipBoxStyle(stageScale, baseW, baseH)}>
            <div style={boardStageScaledInnerStyle(stageScale, baseW, baseH)}>
              <A4WorksheetRenderer worksheet={thumbWorksheet} showGuide={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
