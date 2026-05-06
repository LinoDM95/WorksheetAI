import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { Logo } from '../../../components/Logo';
import { Button, IconButton } from '../../../components/ui';
import { exitElementFullscreen, requestDocumentFullscreen } from '../../../lib/requestDocumentFullscreen';
import { BoardFullscreenPreview } from '../components/BoardFullscreenPreview';
import { fetchPublicBoardByToken, type PublicBoardPayload } from '../publicBoardApi';
import type { LibraryId } from '../types';

export function StudentBoardPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
          document.title = payload.title ? `${payload.title} · Übung` : 'Board · Übung';
        }
      } catch (e) {
        if (!cancelled) {
          let msg = 'Diese Übung ist nicht erreichbar oder der Link ist nicht aktiv.';
          if (axios.isAxiosError(e)) {
            const raw = e.response?.data as { detail?: unknown } | undefined;
            const d = raw?.detail;
            if (typeof d === 'string' && d.trim()) {
              msg = d.trim();
            }
          }
          setError(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
      document.title = 'Worksheet AI';
    };
  }, [token]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      await requestDocumentFullscreen();
    } finally {
      setSessionStarted(true);
      setStarting(false);
    }
  }, []);

  const handleExitToLobby = useCallback(async () => {
    await exitElementFullscreen();
    setSessionStarted(false);
  }, []);

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

  if (!sessionStarted) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 bg-gradient-to-b from-slate-100 via-white to-indigo-50 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]"
        role="region"
        aria-label="Startbereich Schüler-Übung"
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <Logo tagline={false} className="scale-125 sm:scale-150" />
          {data.title ? (
            <h1 className="max-w-lg text-balance text-xl font-semibold text-slate-900 sm:text-2xl">{data.title}</h1>
          ) : null}
          <p className="max-w-sm text-sm text-slate-600">
            Nur diese Übung — kein Login. Tippe auf den Button, dann wechselt das Gerät in den Vollbildmodus.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-[3.5rem] min-w-[min(100%,16rem)] px-8 text-lg font-semibold shadow-lg sm:min-h-[4rem] sm:text-xl"
          loading={starting}
          onClick={() => void handleStart()}
          aria-label="Übung im Vollbild starten"
        >
          🚀 Übung starten
        </Button>
        <p className="max-w-xs text-center text-xs text-slate-500">
          Auf manchen iPhones schaltet Safari kein Seiten-Vollbild — die Übung startet trotzdem normal.
        </p>
      </div>
    );
  }

  return (
    <BoardFullscreenPreview
      layoutKey={`student-${token}`}
      viewTransitionGroupName={`student-board-fs-${token}`}
      forceFullscreenLayout
      minimalToolbar
      showReloadInMinimalToolbar
      eyebrowTitle="Schüleransicht"
      eyebrowSubtitle={data.title ? data.title : 'Nur diese Übung — tippe und übe.'}
      toolbarExtras={
        <IconButton
          type="button"
          variant="secondary"
          size="sm"
          className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/15"
          aria-label="Vollbild beenden und zum Startbildschirm"
          title="Zum Startbildschirm"
          onClick={() => void handleExitToLobby()}
        >
          <X size={14} aria-hidden />
        </IconButton>
      }
      reloadKey={reloadKey}
      onReload={() => setReloadKey((k) => k + 1)}
      html={data.html}
      css={data.css}
      javascript={data.javascript}
      boardFrameId={token}
      usedLibraries={data.used_libraries as LibraryId[]}
      usedDatasets={data.used_datasets}
      scriptsEnabled
    />
  );
}
