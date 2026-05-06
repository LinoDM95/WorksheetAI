import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

export const STAGE_BASE_W = 1280;
export const STAGE_BASE_H = 720;

export type BoardStageFitMode = 'contain' | 'cover';

export function useBoardStageScale(
  containerRef: RefObject<HTMLElement | null>,
  baseW = STAGE_BASE_W,
  baseH = STAGE_BASE_H,
  layoutResetKey?: string,
  /** `cover` füllt den Container (Thumbnails); `contain` zeigt die ganze Bühne (Editor/Play). */
  fit: BoardStageFitMode = 'contain',
) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const s =
        fit === 'cover'
          ? Math.max(r.width / baseW, r.height / baseH)
          : Math.min(r.width / baseW, r.height / baseH);
      setScale(s > 0 && Number.isFinite(s) ? s : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseW, baseH, layoutResetKey ?? '', fit]);
  return scale;
}

/** Sichtfenster exakt Base×Scale; schneidet nichts vom skalierten Inhalt ab. */
export function boardStageClipBoxStyle(scale: number, baseW = STAGE_BASE_W, baseH = STAGE_BASE_H): CSSProperties {
  return {
    width: baseW * scale,
    height: baseH * scale,
    overflow: 'hidden',
  };
}

/**
 * scale() verkleinert nur die Darstellung; diese Ränder ziehen die Layout-Box auf Base×Scale,
 * sonst würde overflow:hidden den Inhalt wie bei voller Basisgröße beschneiden.
 */
export function boardStageScaledInnerStyle(scale: number, baseW = STAGE_BASE_W, baseH = STAGE_BASE_H): CSSProperties {
  return {
    width: baseW,
    height: baseH,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    marginRight: -baseW * (1 - scale),
    marginBottom: -baseH * (1 - scale),
  };
}
