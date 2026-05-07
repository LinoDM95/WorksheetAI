import { useCallback, useEffect, useState, type RefObject } from 'react';

export function useDominantA4PageInScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  pageCount: number,
  /** Wechsel triggert Neu-Anbindung, sobald die Vorschau im DOM hängt (ref war zuvor null). */
  mountKey: string,
) {
  const [dominantIndex0, setDominantIndex0] = useState(0);

  const recompute = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>('.a4-page[data-a4-page-index]');
    if (els.length === 0) return;

    const rr = root.getBoundingClientRect();
    const centerY = (rr.top + rr.bottom) / 2;
    let bestIdx = 0;
    let bestVis = -1;
    let bestDist = Number.POSITIVE_INFINITY;

    els.forEach((el) => {
      const pr = el.getBoundingClientRect();
      const visTop = Math.max(rr.top, pr.top);
      const visBottom = Math.min(rr.bottom, pr.bottom);
      const visibleH = Math.max(0, visBottom - visTop);
      const raw = el.dataset.a4PageIndex;
      const idx = raw != null && raw !== '' ? Number(raw) : 0;
      const i = Number.isFinite(idx) ? idx : 0;
      const elCenterY = (pr.top + pr.bottom) / 2;
      const dist = Math.abs(elCenterY - centerY);

      if (visibleH > bestVis + 0.5) {
        bestVis = visibleH;
        bestIdx = i;
        bestDist = dist;
      } else if (Math.abs(visibleH - bestVis) <= 0.5 && visibleH > 0 && dist < bestDist) {
        bestIdx = i;
        bestDist = dist;
      }
    });

    setDominantIndex0((prev) => (prev === bestIdx ? prev : bestIdx));
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => recompute());
    };

    schedule();
    root.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(root);

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  }, [recompute, pageCount, mountKey]);

  useEffect(() => {
    if (pageCount <= 0) return;
    setDominantIndex0((d) => Math.min(Math.max(0, d), pageCount - 1));
  }, [pageCount]);

  return dominantIndex0;
}
