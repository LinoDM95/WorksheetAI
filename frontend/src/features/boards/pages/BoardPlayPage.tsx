import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Maximize2, Minimize2, MoreHorizontal, QrCode, RotateCw, X } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui';
import { fetchBoard, updateBoardCode } from '../boardsApi';
import { BOARDS_DETAIL_QUERY_KEY } from '../../../lib/listQueries';
import { BoardShareQrModal } from '../components/BoardShareQrModal';
import { BoardStudentSharePrepModal } from '../components/BoardStudentSharePrepModal';
import { FreeHtmlBoardFrame } from '../components/free-html/FreeHtmlBoardFrame';
import { buildStudentBoardUrl } from '../publicBoardApi';
import { boardStageClipBoxStyle, boardStageScaledInnerStyle, STAGE_BASE_W, STAGE_BASE_H, useBoardStageScale } from '../boardStageLayout';
import { cn } from '../../../lib/cn';
import { exitElementFullscreen } from '../../../lib/requestDocumentFullscreen';
import { needsStudentSharePrep } from '../lib/studentShareFlow';

export function BoardPlayPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const playStageOuterRef = useRef<HTMLDivElement>(null);
  const playStageScale = useBoardStageScale(playStageOuterRef, STAGE_BASE_W, STAGE_BASE_H, id);
  const [reloadKey, setReloadKey] = useState(0);
  const [scriptsEnabled, setScriptsEnabled] = useState(true);
  const [browserFs, setBrowserFs] = useState(false);
  const [shareQrOpen, setShareQrOpen] = useState(false);
  const [sharePrepOpen, setSharePrepOpen] = useState(false);
  const [shareQrPayload, setShareQrPayload] = useState<{
    url: string;
    expiresAt: string | null;
    title: string;
  } | null>(null);

  const chromeH = 'calc(4.5rem + env(safe-area-inset-top, 0px))';

  const { data: board, isPending, isError } = useQuery({
    queryKey: BOARDS_DETAIL_QUERY_KEY(id),
    queryFn: () => fetchBoard(id),
    enabled: Boolean(id),
  });

  const patchMutation = useMutation({
    mutationFn: (body: { student_link_enabled?: boolean; student_link_valid_minutes?: number | null }) =>
      updateBoardCode(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
    },
  });

  const showShareQrModalWithPayload = useCallback((payload: { url: string; expiresAt: string | null; title: string }) => {
    void (async () => {
      await exitElementFullscreen();
      setShareQrPayload(payload);
      setShareQrOpen(true);
    })();
  }, []);

  const openExistingShareQr = useCallback(() => {
    if (!board?.share_token || !board.student_link_enabled) return;
    showShareQrModalWithPayload({
      url: buildStudentBoardUrl(board.share_token),
      expiresAt: board.student_link_expires_at ?? null,
      title: board.title || '',
    });
  }, [board, showShareQrModalWithPayload]);

  const handleStudentShareMenuClick = useCallback(() => {
    void (async () => {
      await exitElementFullscreen();
      if (!board || needsStudentSharePrep(board)) {
        setSharePrepOpen(true);
        return;
      }
      openExistingShareQr();
    })();
  }, [board, openExistingShareQr]);

  const handleConfirmStudentShare = useCallback(
    (validMinutes: number) => {
      patchMutation.mutate(
        { student_link_enabled: true, student_link_valid_minutes: validMinutes },
        {
          onSuccess: async (data) => {
            await exitElementFullscreen();
            setSharePrepOpen(false);
            const token = data.share_token ?? board?.share_token ?? null;
            if (token) {
              setShareQrPayload({
                url: buildStudentBoardUrl(token),
                expiresAt: data.student_link_expires_at ?? null,
                title: data.title || board?.title || '',
              });
              setShareQrOpen(true);
            }
          },
        },
      );
    },
    [patchMutation, board?.share_token, board?.title],
  );

  const goEditor = useCallback(() => {
    navigate(`/app/boards/${id}`);
  }, [id, navigate]);

  const exitBrowserFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
    setBrowserFs(false);
  }, []);

  const leavePresentation = useCallback(async () => {
    await exitBrowserFullscreen();
    goEditor();
  }, [exitBrowserFullscreen, goEditor]);

  useEffect(() => {
    const onFsChange = () => {
      setBrowserFs(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        e.preventDefault();
        return;
      }
      e.preventDefault();
      void leavePresentation();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leavePresentation]);

  useEffect(() => {
    return () => {
      void exitBrowserFullscreen();
    };
  }, [exitBrowserFullscreen]);

  const handleToggleBrowserFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await el.requestFullscreen();
    } catch {
      /* Safari / embedded may block */
    }
  }, []);

  if (isPending) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-black text-sm text-slate-400">
        Lade Board …
      </div>
    );
  }
  if (isError || !board) {
    return (
      <div className="grid min-h-[100dvh] place-items-center gap-3 bg-black p-6 text-center text-sm text-slate-400">
        <p>Board konnte nicht geladen werden.</p>
        <Button variant="secondary" size="lg" onClick={() => navigate('/app/boards')}>
          Zurück zur Liste
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      id="board-play-root"
      className={cn(
        'flex min-h-0 flex-col bg-black pb-[env(safe-area-inset-bottom,0px)] text-white',
        browserFs ? 'h-full' : 'h-[100dvh] max-h-[100dvh]',
      )}
    >
      {!browserFs ? (
      <header
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/95 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] shadow-lg sm:gap-3 sm:px-4 sm:py-3"
        style={{ minHeight: chromeH }}
      >
        <Button
          variant="secondary"
          size="lg"
          className="min-h-12 min-w-[3rem] shrink-0 sm:min-w-0"
          onClick={leavePresentation}
          leftIcon={<ArrowLeft size={20} aria-hidden />}
          aria-label="Zurück zum Editor und Präsentation beenden"
        >
          <span className="hidden sm:inline">Zurück</span>
        </Button>

        <h1 className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold sm:text-left sm:text-base">
          {board.title}
        </h1>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <details className="relative min-h-12">
            <summary className="flex h-12 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-600 bg-slate-800/80 px-3 text-sm font-medium text-slate-100 marker:content-none [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="sm:hidden" size={22} aria-hidden />
              <span className="hidden sm:inline">Weitere Optionen</span>
            </summary>
            <div className="absolute right-0 z-20 mt-1 flex min-w-[220px] flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-3 text-sm">
                <input
                  type="checkbox"
                  checked={scriptsEnabled}
                  onChange={(e) => setScriptsEnabled(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-indigo-400"
                />
                JavaScript / Skripte
              </label>
              <Button
                variant="secondary"
                size="lg"
                className="w-full justify-center"
                onClick={() => setReloadKey((k) => k + 1)}
                leftIcon={<RotateCw size={18} aria-hidden />}
              >
                Neu laden
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full justify-center"
                onClick={() => void handleToggleBrowserFullscreen()}
                leftIcon={
                  browserFs ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />
                }
              >
                {browserFs ? 'Randlos beenden' : 'Nur Tafel randlos (Bildschirm)'}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full justify-center"
                loading={patchMutation.isPending && sharePrepOpen}
                onClick={() => handleStudentShareMenuClick()}
                leftIcon={<QrCode size={18} aria-hidden />}
              >
                QR &amp; Link
              </Button>
            </div>
          </details>

          <div className="hidden items-center gap-2 sm:flex">
            <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-3 text-sm">
              <input
                type="checkbox"
                checked={scriptsEnabled}
                onChange={(e) => setScriptsEnabled(e.target.checked)}
                className="h-5 w-5 accent-indigo-400"
              />
              Skripte
            </label>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setReloadKey((k) => k + 1)}
              leftIcon={<RotateCw size={18} aria-hidden />}
            >
              Neu laden
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => void handleToggleBrowserFullscreen()}
              leftIcon={
                browserFs ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />
              }
            >
              {browserFs ? 'Randlos aus' : 'Randlos'}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              loading={patchMutation.isPending && sharePrepOpen}
              onClick={() => handleStudentShareMenuClick()}
              leftIcon={<QrCode size={18} aria-hidden />}
            >
              QR &amp; Link
            </Button>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="min-h-12 min-w-[8.5rem] shrink-0 font-semibold shadow-md"
            onClick={leavePresentation}
            leftIcon={<X size={20} aria-hidden />}
            aria-label="Smartboard-Präsentation beenden (oder Esc)"
          >
            Beenden
          </Button>
        </div>
      </header>
      ) : null}

      <p className="sr-only" aria-live="polite">
        Taste Esc beendet die Präsentation und kehrt zum Editor zurück.
      </p>

      <main
        ref={playStageOuterRef}
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black"
      >
        <div
          className={cn(
            'overflow-hidden bg-white',
            browserFs ? '' : 'rounded-xl shadow-lg shadow-black/40',
          )}
          style={boardStageClipBoxStyle(playStageScale)}
        >
          <div style={boardStageScaledInnerStyle(playStageScale)}>
            <FreeHtmlBoardFrame
              html={board.html}
              css={board.css}
              javascript={board.javascript}
              scriptsEnabled={scriptsEnabled}
              reloadKey={reloadKey}
              boardFrameId={board.id}
              usedLibraries={board.used_libraries}
              usedDatasets={board.used_datasets}
              fillHeight
              fitContainer
              className="!h-full !min-h-0 !rounded-none !ring-0"
            />
          </div>
        </div>
      </main>

      {browserFs ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] print:hidden">
          <div className="pointer-events-auto">
            <Button
              variant="secondary"
              size="lg"
              className="border-slate-600 bg-slate-900/95 text-white shadow-lg backdrop-blur-sm"
              onClick={() => void handleToggleBrowserFullscreen()}
              leftIcon={<Minimize2 size={18} aria-hidden />}
            >
              Randlos beenden
            </Button>
          </div>
        </div>
      ) : null}

      <IconButton
        variant="ghost"
        size="lg"
        className="fixed bottom-4 right-4 z-30 h-14 w-14 rounded-full border border-white/20 bg-slate-900/90 text-white shadow-2xl backdrop-blur-sm sm:hidden"
        aria-label="Präsentation beenden"
        onClick={leavePresentation}
      >
        <X size={28} aria-hidden />
      </IconButton>
      <BoardStudentSharePrepModal
        open={sharePrepOpen}
        onClose={() => setSharePrepOpen(false)}
        onConfirm={handleConfirmStudentShare}
        busy={patchMutation.isPending}
      />
      <BoardShareQrModal
        open={shareQrOpen && Boolean(shareQrPayload?.url)}
        onClose={() => {
          setShareQrOpen(false);
          setShareQrPayload(null);
        }}
        studentUrl={shareQrPayload?.url ?? ''}
        title={shareQrPayload?.title ?? ''}
        expiresAt={shareQrPayload?.expiresAt}
      />
    </div>
  );
}
