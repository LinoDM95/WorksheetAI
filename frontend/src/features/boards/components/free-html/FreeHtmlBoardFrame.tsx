import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../../lib/cn';
import { buildFreeHtmlSrcDoc } from './buildFreeHtmlSrcDoc';
import type { DatasetId, LibraryId } from '../../types';

const DATASET_LOADING_HTML =
  '<div class="free-board" style="min-height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-size:clamp(0.9rem,2vw,1.1rem);color:#64748b;text-align:center;padding:1rem">Datensätze werden geladen…</div>';

type Props = {
  html: string;
  css: string;
  javascript: string;
  scriptsEnabled: boolean;
  reloadKey: number;
  className?: string;
  usedLibraries?: LibraryId[];
  usedDatasets?: DatasetId[];
  /** Volle Höhe des Eltern-Layouts (flex-1); ohne festes 16:9. */
  fillHeight?: boolean;
  /** Eltern-Box definiert Größe (z. B. 16:9-Stage im Play-Modus) — iframe füllt exakt diese Fläche. */
  fitContainer?: boolean;
};

const datasetIdsKey = (ids: DatasetId[] | undefined): string =>
  [...(ids || [])].filter(Boolean).sort().join('\u0001');

export const FreeHtmlBoardFrame = ({
  html,
  css,
  javascript,
  scriptsEnabled,
  reloadKey,
  className,
  usedLibraries,
  usedDatasets,
  fillHeight = false,
  fitContainer = false,
}: Props) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [boardDatasets, setBoardDatasets] = useState<Record<string, unknown> | null>(null);
  const idsSignature = useMemo(() => datasetIdsKey(usedDatasets), [usedDatasets]);

  useEffect(() => {
    const ids = [...(usedDatasets || [])].filter(Boolean);
    if (ids.length === 0) {
      setBoardDatasets({});
      return;
    }
    let cancelled = false;
    setBoardDatasets(null);
    void (async () => {
      const out: Record<string, unknown> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/board-datasets/${encodeURIComponent(id)}.json`);
            if (!res.ok) return;
            out[id] = await res.json();
          } catch {
            /* skip */
          }
        }),
      );
      if (!cancelled) setBoardDatasets(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [idsSignature]);

  const documentBaseHref = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const base = import.meta.env.BASE_URL || '/';
    const path = base.endsWith('/') ? base : `${base}/`;
    return `${window.location.origin}${path}`;
  }, []);

  const srcDoc = useMemo(() => {
    const ids = (usedDatasets || []).filter(Boolean);
    const waitingForDatasets = ids.length > 0 && boardDatasets === null;
    if (waitingForDatasets) {
      return buildFreeHtmlSrcDoc({
        html: DATASET_LOADING_HTML,
        css: '',
        javascript: '',
        scriptsEnabled: false,
        usedLibraries: [],
        boardDatasets: {},
        documentBaseHref,
      });
    }
    return buildFreeHtmlSrcDoc({
      html,
      css,
      javascript,
      scriptsEnabled,
      usedLibraries,
      boardDatasets: boardDatasets ?? {},
      documentBaseHref,
    });
  }, [
    html,
    css,
    javascript,
    scriptsEnabled,
    usedLibraries,
    boardDatasets,
    usedDatasets,
    reloadKey,
    documentBaseHref,
  ]);

  useLayoutEffect(() => {
    const el = iframeRef.current;
    if (el) {
      el.srcdoc = srcDoc;
    }
  }, [srcDoc]);

  const expandInParent = fillHeight || fitContainer;
  const showAspectCard = !expandInParent;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl ring-1 ring-slate-200',
        expandInParent && 'h-full min-h-0',
        fillHeight && 'flex-1',
        className,
      )}
    >
      <div
        className={cn(
          'relative w-full min-h-0 bg-white',
          showAspectCard && 'aspect-video',
          expandInParent && 'flex-1',
        )}
      >
        <iframe
          key={reloadKey}
          ref={iframeRef}
          title="Tafelbild (Sandbox)"
          className="absolute inset-0 block h-full w-full min-h-0 border-0 bg-white"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
        />
      </div>
      {!scriptsEnabled && (
        <p className="shrink-0 border-t border-slate-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
          JavaScript ist deaktiviert — nur HTML/CSS sichtbar.
        </p>
      )}
    </div>
  );
};
