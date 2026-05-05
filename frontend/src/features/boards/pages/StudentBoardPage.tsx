import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { boardStageClipBoxStyle, boardStageScaledInnerStyle, useBoardStageScale } from '../boardStageLayout';
import { FreeHtmlBoardFrame } from '../components/free-html/FreeHtmlBoardFrame';
import { fetchPublicBoardByToken, type PublicBoardPayload } from '../publicBoardApi';
import type { LibraryId } from '../types';

export function StudentBoardPage() {
  const { token = '' } = useParams<{ token: string }>();
  const stageOuterRef = useRef<HTMLDivElement>(null);
  const stageScale = useBoardStageScale(stageOuterRef);
  const [data, setData] = useState<PublicBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Ungültiger Link.');
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const payload = await fetchPublicBoardByToken(token);
        if (!cancelled) {
          setData(payload);
          document.title = payload.title ? `${payload.title} · Übung` : 'Tafelbild · Übung';
        }
      } catch {
        if (!cancelled) {
          setError('Diese Übung ist nicht erreichbar oder der Link ist nicht aktiv.');
        }
      }
    })();
    return () => {
      cancelled = true;
      document.title = 'Worksheet AI';
    };
  }, [token]);

  if (error) {
    return (
      <div className="grid min-h-[100dvh] place-content-center bg-slate-100 px-4">
        <p className="max-w-md text-center text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-100 text-sm text-slate-500">
        Lade Übung …
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col bg-slate-950">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900 px-3 py-2 text-center">
        <p className="truncate text-xs text-slate-400">Nur diese Übung — kein Klassen-Login nötig</p>
        {data.title ? (
          <h1 className="truncate text-sm font-medium text-white">{data.title}</h1>
        ) : null}
      </header>
      <main
        ref={stageOuterRef}
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black"
      >
        <div className="overflow-hidden rounded-xl bg-white shadow-lg shadow-black/30" style={boardStageClipBoxStyle(stageScale)}>
          <div style={boardStageScaledInnerStyle(stageScale)}>
            <FreeHtmlBoardFrame
              html={data.html}
              css={data.css}
              javascript={data.javascript}
              scriptsEnabled
              reloadKey={0}
              usedLibraries={data.used_libraries as LibraryId[]}
              usedDatasets={data.used_datasets}
              fillHeight
              fitContainer
              className="!h-full !min-h-0 !rounded-none !ring-0"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
