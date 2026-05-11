import { useCallback, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderPlus, MessageCircle, ShieldAlert, Star } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
} from '../../../components/ui';
import {
  boardLibraryEntryQueryKey,
  boardsLibraryQueryKey,
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
} from '../../../lib/listQueries';
import {
  adoptBoardFromLibrary,
  backofficeDeleteBoard,
  backofficeUnpublishBoard,
  fetchBoardLibraryEntry,
  rateBoardInLibrary,
  updateBoardCode,
} from '../boardsApi';
import { addPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';
import { LIBRARY_TECH_LABELS } from '../lib/boardLibraryLabels';
import { BoardShareQrModal } from '../components/BoardShareQrModal';
import { BoardStudentSharePrepModal } from '../components/BoardStudentSharePrepModal';
import { BoardLibraryCommentsSection } from '../components/library/BoardLibraryCommentsSection';
import { BoardLibraryInteractiveRating } from '../components/library/BoardLibraryInteractiveRating';
import { BoardLibraryLivePreview } from '../components/library/BoardLibraryLivePreview';
import { LibraryPlannedDuration } from '../components/library/LibraryPlannedDuration';
import { needsStudentSharePrep } from '../lib/studentShareFlow';
import { buildStudentBoardUrl } from '../publicBoardApi';
import { useAuth } from '../../../lib/authContext';
import type { BoardLibraryItem } from '../types';

export function BoardLibraryCommunityPreviewPage() {
  const { libraryBoardId = '' } = useParams<{ libraryBoardId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = Boolean(user?.is_staff);
  const cached =
    queryClient
      .getQueryData<BoardLibraryItem[]>(boardsLibraryQueryKey('all'))
      ?.find((b) => b.id === libraryBoardId) ??
    queryClient
      .getQueryData<BoardLibraryItem[]>(boardsLibraryQueryKey('mine'))
      ?.find((b) => b.id === libraryBoardId);

  const itemQuery = useQuery({
    queryKey: boardLibraryEntryQueryKey(libraryBoardId),
    queryFn: () => fetchBoardLibraryEntry(libraryBoardId),
    enabled: Boolean(libraryBoardId),
    placeholderData: cached,
    staleTime: 25_000,
  });

  const adoptMutation = useMutation({
    mutationFn: (id: string) => adoptBoardFromLibrary(id),
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      addPendingFirstOpenBoard(board.id);
      navigate('/app/boards');
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, stars }: { id: string; stars: number }) => rateBoardInLibrary(id, stars),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<BoardLibraryItem | undefined>(
        boardLibraryEntryQueryKey(variables.id),
        (old) =>
          old
            ? {
                ...old,
                my_stars: data.stars,
                avg_rating: data.avg_rating,
                rating_count: data.rating_count,
              }
            : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
    },
  });

  const staffUnpublish = useMutation({
    mutationFn: () => backofficeUnpublishBoard(libraryBoardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
      void queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      navigate('/app/boards/library', { replace: true });
    },
  });

  const staffDeleteBoard = useMutation({
    mutationFn: () => backofficeDeleteBoard(libraryBoardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
      void queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      navigate('/app/boards/library', { replace: true });
    },
  });

  const [shareQrOpen, setShareQrOpen] = useState(false);
  const [sharePrepOpen, setSharePrepOpen] = useState(false);
  const [shareQrPayload, setShareQrPayload] = useState<{
    url: string;
    expiresAt: string | null;
    title: string;
  } | null>(null);
  const librarySharePortalRef = useRef<HTMLDivElement | null>(null);

  const board = itemQuery.data;

  const sharePatchMutation = useMutation({
    mutationFn: (body: { student_link_enabled?: boolean; student_link_valid_minutes?: number | null }) =>
      updateBoardCode(libraryBoardId, body),
    onSuccess: (data) => {
      queryClient.setQueryData<BoardLibraryItem | undefined>(
        boardLibraryEntryQueryKey(libraryBoardId),
        (old) =>
          old
            ? {
                ...old,
                share_token: data.share_token ?? old.share_token,
                student_link_enabled: data.student_link_enabled,
                student_link_expires_at: data.student_link_expires_at ?? null,
              }
            : old,
      );
      void queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(libraryBoardId) });
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: boardsLibraryQueryKey('mine') });
    },
  });

  const showShareQrModalWithPayload = useCallback((payload: { url: string; expiresAt: string | null; title: string }) => {
    setShareQrPayload(payload);
    setShareQrOpen(true);
  }, []);

  const openExistingShareQr = useCallback(() => {
    if (!board?.share_token || !board.student_link_enabled) return;
    showShareQrModalWithPayload({
      url: buildStudentBoardUrl(board.share_token),
      expiresAt: board.student_link_expires_at ?? null,
      title: board.title || '',
    });
  }, [board, showShareQrModalWithPayload]);

  const handleLibraryShareClick = useCallback(() => {
    if (!board || needsStudentSharePrep(board)) {
      setSharePrepOpen(true);
      return;
    }
    openExistingShareQr();
  }, [board, openExistingShareQr]);

  const handleConfirmStudentShare = useCallback(
    (validMinutes: number) => {
      sharePatchMutation.mutate(
        { student_link_enabled: true, student_link_valid_minutes: validMinutes },
        {
          onSuccess: (data) => {
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
    [sharePatchMutation, board?.share_token, board?.title],
  );

  const handleResetStudentLinkValidity = useCallback(
    (validMinutes: number) => {
      sharePatchMutation.mutate(
        { student_link_valid_minutes: validMinutes },
        {
          onSuccess: (data) => {
            setShareQrPayload((prev) =>
              prev ? { ...prev, expiresAt: data.student_link_expires_at ?? null } : prev,
            );
          },
        },
      );
    },
    [sharePatchMutation],
  );

  const isOwner = Boolean(board?.viewer_is_owner);
  const errStatus = (itemQuery.error as { response?: { status?: number } })?.response?.status;

  if (!libraryBoardId) {
    return (
      <div className="p-6">
        <EmptyStateMissingSelection />
      </div>
    );
  }

  if (itemQuery.isError && errStatus === 404) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <PreviewBackBar />
        <EmptyState
          className="mt-6"
          title="Board nicht gefunden"
          description="Es ist nicht (mehr) öffentlich in der Bibliothek oder der Link ist ungültig."
          action={
            <Button as="link" to="/app/boards/library" variant="secondary">
              Zur Bibliothek
            </Button>
          }
        />
      </div>
    );
  }

  if (itemQuery.isError && (errStatus === 403 || errStatus === 401)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <PreviewBackBar />
        <Alert tone="error" className="mt-4">
          Für die Vorschau ist eine Anmeldung nötig.
        </Alert>
      </div>
    );
  }

  if (!board && itemQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <PreviewBackBar />
        <p className="mt-6 text-sm text-[var(--color-ink-500)]">Lade Board …</p>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="p-6">
        <EmptyStateMissingSelection />
      </div>
    );
  }

  const cc = board.comment_count ?? 0;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 sm:px-5">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Button
              as="link"
              to="/app/boards/library"
              variant="ghost"
              size="sm"
              className="shrink-0 !px-2"
              aria-label="Zurück zur Bibliothek"
              leftIcon={<ArrowLeft size={16} aria-hidden />}
            >
              <span className="hidden sm:inline">Übersicht</span>
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
                {board.title || 'Ohne Titel'}
              </p>
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-ink-500)]">
                <span className="min-w-0 truncate">
                  {[board.subject, board.grade].filter(Boolean).join(' · ') || 'Kein Fach angegeben'}
                </span>
                <LibraryPlannedDuration minutes={board.planned_duration_minutes} />
              </p>
            </div>
          </div>
        </div>
      </div>

      {adoptMutation.isError ? (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <Alert tone="error">Übernehmen fehlgeschlagen. Bitte erneut versuchen.</Alert>
        </div>
      ) : null}
      {rateMutation.isError ? (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <Alert tone="error">Bewertung konnte nicht gespeichert werden.</Alert>
        </div>
      ) : null}
      {staffUnpublish.isError ? (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <Alert tone="error">Aus der Bibliothek nehmen — bitte erneut versuchen.</Alert>
        </div>
      ) : null}
      {staffDeleteBoard.isError ? (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <Alert tone="error">Löschen fehlgeschlagen — bitte erneut versuchen.</Alert>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-3 pb-[max(2.5rem,env(safe-area-inset-bottom,12px))] sm:flex-row sm:gap-6 sm:p-5 sm:pb-12 lg:gap-8">
        <section
          className="relative flex min-h-[min(48dvh,420px)] shrink-0 flex-col sm:min-h-[min(60vh,600px)] sm:flex-1 lg:min-h-0 lg:flex-[1.15]"
          aria-label="Interaktive Board-Vorschau"
        >
          <Card flush className="flex min-h-0 flex-1 flex-col overflow-hidden !p-0">
            <BoardLibraryLivePreview
              boardId={board.id}
              layoutKey={`${libraryBoardId}-${board.viewer_is_owner ? 'mine' : 'pub'}`}
              html={board.html}
              css={board.css}
              javascript={board.javascript}
              usedLibraries={board.used_libraries ?? []}
              usedDatasets={board.used_datasets}
              shareOverlayPortalRef={librarySharePortalRef}
              toolbarExtras={
                !isOwner
                  ? () => (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="!px-2"
                        loading={adoptMutation.isPending && adoptMutation.variables === board.id}
                        disabled={adoptMutation.isPending}
                        title="Eine eigene Kopie unter Smartboard anlegen und bearbeiten"
                        aria-label="In meine Sammlung übernehmen"
                        leftIcon={<FolderPlus size={14} aria-hidden />}
                        onClick={() => adoptMutation.mutate(board.id)}
                      >
                        <span className="hidden sm:inline">In Sammlung übernehmen</span>
                      </Button>
                    )
                  : undefined
              }
              shareToolbarAction={
                isOwner
                  ? {
                      onClick: handleLibraryShareClick,
                      loading: sharePatchMutation.isPending && sharePrepOpen,
                    }
                  : undefined
              }
            />
          </Card>
        </section>

        <aside
          className="flex w-full shrink-0 flex-col gap-4 sm:max-w-full lg:w-[min(380px,34%)] xl:w-[360px]"
          aria-label="Details und Community"
        >
          {isStaff ? (
            <Card className="border-amber-200 bg-amber-50/90 !p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <ShieldAlert size={18} className="shrink-0" aria-hidden />
                Moderation (Admin)
              </div>
              <p className="mt-1 text-[12px] leading-snug text-amber-950/90">
                Öffentlichen Eintrag entfernen (bleibt beim Autor privat) oder das Board inkl. Daten endgültig löschen.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={staffUnpublish.isPending}
                  disabled={
                    staffUnpublish.isPending ||
                    staffDeleteBoard.isPending ||
                    adoptMutation.isPending
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        'Diesen Eintrag aus der öffentlichen Bibliothek nehmen? (Das Board bleibt beim Ersteller erhalten.)',
                      )
                    ) {
                      void staffUnpublish.mutate();
                    }
                  }}
                >
                  Aus Bibliothek entfernen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-800 hover:bg-red-50"
                  loading={staffDeleteBoard.isPending}
                  disabled={
                    staffDeleteBoard.isPending ||
                    staffUnpublish.isPending ||
                    adoptMutation.isPending
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        'Das Smartboard wirklich endgültig löschen? Dies kann nicht rückgängig gemacht werden.',
                      )
                    ) {
                      void staffDeleteBoard.mutate();
                    }
                  }}
                >
                  Endgültig löschen
                </Button>
              </div>
            </Card>
          ) : null}

          <Card className="space-y-3 !p-4">
            <div className="flex flex-wrap items-start gap-2">
              {isOwner ? (
                <Badge tone="primary" className="!text-[10px]">
                  Dein Board
                </Badge>
              ) : null}
              {board.avg_rating != null && board.avg_rating >= 4 ? (
                <Badge tone="accent" className="!text-[10px]">
                  Top bewertet
                </Badge>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg-muted)] px-2 py-0.5 text-[11px] text-[var(--color-ink-600)] ring-1 ring-[var(--color-border)]">
                <MessageCircle size={12} aria-hidden /> {cc} Kommentar{cc === 1 ? '' : 'e'}
              </span>
            </div>

            {board.topic ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-500)]">Thema</p>
                <p className="text-sm leading-snug text-[var(--color-ink-800)]">{board.topic}</p>
              </div>
            ) : null}

            {board.description?.trim() ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-500)]">
                  Beschreibung
                </p>
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink-800)]">
                  {board.description.trim()}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-ink-500)]">Keine zusätzliche Beschreibung hinterlegt.</p>
            )}

            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="mb-1 text-[11px] text-[var(--color-ink-500)]">
                {board.library_published_at ? (
                  <>
                    In der Bibliothek seit{' '}
                    <span className="font-medium text-[var(--color-ink-700)] tabular-nums">
                      {new Date(board.library_published_at).toLocaleDateString('de-DE', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </>
                ) : (
                  <span className="font-medium text-[var(--color-ink-600)]">Öffentlicher Eintrag</span>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(board.used_libraries ?? []).length === 0 ? (
                  <span className="text-[11px] text-[var(--color-ink-400)]">Ohne Zusatz-Bibliotheken</span>
                ) : (
                  (board.used_libraries ?? []).map((lib) => (
                    <span
                      key={lib}
                      className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800 ring-1 ring-indigo-100/80"
                    >
                      {LIBRARY_TECH_LABELS[lib] ?? lib}
                    </span>
                  ))
                )}
              </div>
            </div>
          </Card>

          <Card className="space-y-2 !p-4">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-500" aria-hidden />
              <p className="text-sm font-semibold text-[var(--color-ink-800)]">Community-Bewertung</p>
            </div>
            <BoardLibraryInteractiveRating
              avgRating={board.avg_rating}
              ratingCount={board.rating_count}
              myStars={board.my_stars}
              disabled={rateMutation.isPending}
              onPick={(s) => rateMutation.mutate({ id: board.id, stars: s })}
            />
          </Card>

          {isOwner ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-muted)]/50 px-3 py-2 text-center text-xs text-[var(--color-ink-600)]">
              Eigenes Board — Bearbeitung unter <span className="font-medium">Smartboard</span>.
            </p>
          ) : null}

          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-sm)]">
            <BoardLibraryCommentsSection
              boardId={board.id}
              commentCount={cc}
              loadImmediately
              staffModeration={isStaff}
            />
          </div>
        </aside>
      </div>

      <BoardStudentSharePrepModal
        open={sharePrepOpen}
        onClose={() => setSharePrepOpen(false)}
        onConfirm={handleConfirmStudentShare}
        busy={sharePatchMutation.isPending}
        portalRootRef={librarySharePortalRef}
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
        onResetValidity={isOwner ? handleResetStudentLinkValidity : undefined}
        resetBusy={sharePatchMutation.isPending}
        portalRootRef={librarySharePortalRef}
      />
    </div>
  );
}

function PreviewBackBar() {
  return (
    <div className="shrink-0">
      <Button
        as="link"
        to="/app/boards/library"
        variant="ghost"
        size="sm"
        className="-ml-1 !px-2"
        leftIcon={<ArrowLeft size={16} aria-hidden />}
      >
        Zur Bibliothek
      </Button>
    </div>
  );
}

function EmptyStateMissingSelection() {
  return (
    <EmptyState
      title="Board auswählen"
      description="Öffne zuerst die Bibliothek und wähle eine Kachel aus."
      action={
        <Button as="link" to="/app/boards/library" variant="secondary">
          Zur Übersicht
        </Button>
      }
    />
  );
}
