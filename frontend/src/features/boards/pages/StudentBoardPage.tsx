import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, X } from 'lucide-react';
import { Logo } from '../../../components/Logo';
import { IconButton } from '../../../components/ui';
import {
  exitElementFullscreen,
  isDocumentFullscreenActive,
  requestDocumentFullscreen,
} from '../../../lib/requestDocumentFullscreen';
import { BoardFullscreenPreview } from '../components/BoardFullscreenPreview';
import {
  fetchPublicBoardByToken,
  getOrCreateStudentPresenceClientId,
  postStudentPresence,
  type PublicBoardPayload,
} from '../publicBoardApi';
import type { DatasetId, LibraryId } from '../types';

export function StudentBoardPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicBoardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const immersiveSessionRef = useRef(false);

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
      } catch (e: unknown) {
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

  useEffect(() => {
    if (!token || !data) return;
    const clientId = getOrCreateStudentPresenceClientId(token);
    const touch = () => {
      void postStudentPresence(token, clientId, 'touch').catch(() => {});
    };
    touch();
    const intervalId = window.setInterval(touch, 18_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') touch();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      void postStudentPresence(token, clientId, 'leave').catch(() => {});
    };
  }, [token, data]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    immersiveSessionRef.current = true;
    try {
      await requestDocumentFullscreen();
      if (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(orientation: landscape)').matches
      ) {
        window.setTimeout(() => void requestDocumentFullscreen(), 180);
        window.setTimeout(() => void requestDocumentFullscreen(), 550);
      }
    } finally {
      setSessionStarted(true);
      setStarting(false);
    }
  }, []);

  const handleExitToLobby = useCallback(async () => {
    immersiveSessionRef.current = false;
    await exitElementFullscreen();
    setSessionStarted(false);
  }, []);

  useEffect(() => {
    if (!sessionStarted) return;

    let raf1 = 0;
    let raf2 = 0;
    let t1 = 0;
    let t2 = 0;
    const landscapeTimeouts: number[] = [];

    const tryRestoreFullscreen = () => {
      if (!immersiveSessionRef.current) return;
      if (isDocumentFullscreenActive()) return;
      void requestDocumentFullscreen();
    };

    const scheduleRestore = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          tryRestoreFullscreen();
          t1 = window.setTimeout(tryRestoreFullscreen, 120);
          t2 = window.setTimeout(tryRestoreFullscreen, 380);
        });
      });
    };

    const scheduleLandscapeBurst = () => {
      if (typeof window.matchMedia !== 'function') return;
      if (!window.matchMedia('(orientation: landscape)').matches) return;
      const delays = [80, 260, 620, 1300, 2400];
      delays.forEach((ms) => {
        landscapeTimeouts.push(
          window.setTimeout(() => {
            if (!immersiveSessionRef.current || isDocumentFullscreenActive()) return;
            void requestDocumentFullscreen();
          }, ms),
        );
      });
    };

    scheduleRestore();
    scheduleLandscapeBurst();

    const onFullscreenChange = () => {
      tryRestoreFullscreen();
      scheduleLandscapeBurst();
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
    window.addEventListener('orientationchange', scheduleRestore);
    window.addEventListener('resize', scheduleRestore);

    const vv = window.visualViewport;
    const onVisualViewport = () => scheduleRestore();
    vv?.addEventListener('resize', onVisualViewport);
    vv?.addEventListener('scroll', onVisualViewport);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      landscapeTimeouts.forEach((id) => window.clearTimeout(id));
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
      window.removeEventListener('orientationchange', scheduleRestore);
      window.removeEventListener('resize', scheduleRestore);
      vv?.removeEventListener('resize', onVisualViewport);
      vv?.removeEventListener('scroll', onVisualViewport);
    };
  }, [sessionStarted]);

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
        className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-white px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1.75rem,env(safe-area-inset-top))]"
        role="region"
        aria-label="Startbereich Schüler-Übung"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-32 h-[36rem] w-[36rem] rounded-full bg-indigo-300/40 blur-[120px]" />
          <div className="absolute -bottom-44 -right-32 h-[40rem] w-[40rem] rounded-full bg-violet-300/35 blur-[120px]" />
          <div className="absolute left-1/2 top-1/3 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-sky-200/35 blur-[110px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          />
        </div>

        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
          className="relative z-10 flex justify-center"
        >
          <Logo tagline={false} />
        </motion.header>

        <motion.main
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.33, 1, 0.68, 1], delay: 0.08 }}
          className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden />
              Übung
            </span>
            <h1 className="max-w-md text-balance text-2xl font-semibold leading-tight text-slate-900 sm:text-[28px]">
              {data.title ? data.title : 'Bereit, loszulegen?'}
            </h1>
          </div>

          <motion.button
            type="button"
            onClick={() => void handleStart()}
            disabled={starting}
            aria-label="Übung im Vollbild starten"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.33, 1, 0.68, 1], delay: 0.18 }}
            whileHover={{ y: -2 }}
            whileTap={{ y: 0, scale: 0.98 }}
            className="group relative inline-flex items-center justify-center gap-3.5 rounded-full bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 py-3 pl-3 pr-7 text-base font-semibold text-white shadow-[0_24px_48px_-16px_rgba(79,70,229,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] transition-shadow duration-200 hover:shadow-[0_28px_56px_-16px_rgba(79,70,229,0.65),inset_0_1px_0_rgba(255,255,255,0.22)] active:shadow-[0_18px_36px_-16px_rgba(79,70,229,0.5),inset_0_1px_0_rgba(255,255,255,0.18)] disabled:opacity-70 sm:py-3.5 sm:pl-4 sm:pr-9 sm:text-lg"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-indigo-500/30 opacity-70 blur-xl transition-opacity duration-300 group-hover:opacity-100"
            />
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 ring-1 ring-white/25 sm:h-11 sm:w-11">
              {starting ? (
                <span className="loading-dots" aria-hidden>
                  <span className="loading-dots__dot" />
                  <span className="loading-dots__dot" />
                  <span className="loading-dots__dot" />
                </span>
              ) : (
                <Play size={18} aria-hidden className="ml-0.5 fill-current" />
              )}
            </span>
            <span>Starten</span>
          </motion.button>
        </motion.main>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative z-10 flex flex-col items-center gap-1.5 text-center"
        >
          <p className="text-xs font-medium text-slate-500">Kein Login · öffnet im Vollbild</p>
          <p className="max-w-[34ch] text-[11px] leading-snug text-slate-400">
            iPhone-Querformat: bleibt die Adresszeile, kurz hochkant halten.
          </p>
        </motion.footer>
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
      toolbarCollapsible
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
      onReload={() => setReloadKey((k: number) => k + 1)}
      html={data.html}
      css={data.css}
      javascript={data.javascript}
      boardFrameId={token}
      usedLibraries={data.used_libraries as LibraryId[]}
      usedDatasets={data.used_datasets as DatasetId[]}
      scriptsEnabled
    />
  );
}
