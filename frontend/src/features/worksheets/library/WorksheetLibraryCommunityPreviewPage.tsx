import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FolderPlus, MessageCircle, ShieldAlert, Star } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState } from '../../../components/ui';
import {
  worksheetsLibraryQueryKey,
  worksheetLibraryEntryQueryKey,
  WORKSHEET_LIST_QUERY_KEY,
} from '../../../lib/listQueries';
import { useAuth } from '../../../lib/authContext';
import type { Worksheet, WorksheetLibraryPreview } from '../../../types';
import {
  adoptWorksheetFromLibrary,
  fetchWorksheetLibraryEntry,
  rateWorksheetInLibrary,
} from '../worksheetsApi';
import {
  backofficeDeleteWorksheet,
  backofficeUnpublishWorksheet,
} from '../../boards/boardsApi';
import { A4WorksheetRenderer } from '../A4WorksheetRenderer';
import { BoardLibraryInteractiveRating } from '../../boards/components/library/BoardLibraryInteractiveRating';
import { LibraryPlannedDuration } from '../../boards/components/library/LibraryPlannedDuration';
import { WorksheetLibraryCommentsSection } from './WorksheetLibraryCommentsSection';

function libraryGradeToNumber(g: string | undefined): number | null {
  if (!g?.trim()) return null;
  const head = g.trim().match(/^\s*(\d+)/);
  if (head) return parseInt(head[1], 10);
  const n = parseInt(g.replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function previewToWorksheet(p: WorksheetLibraryPreview): Worksheet {
  return {
    id: p.id,
    title: p.title,
    subject: p.subject ?? '',
    grade: libraryGradeToNumber(p.grade),
    topic: p.topic ?? '',
    page_setup: p.page_setup,
    content: p.content,
    render_model: p.render_model,
  };
}

export function WorksheetLibraryCommunityPreviewPage() {
  const { libraryWorksheetId = '' } = useParams<{ libraryWorksheetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isStaff = Boolean(user?.is_staff);

  const cached =
    queryClient.getQueryData(worksheetsLibraryQueryKey('all')) ??
    queryClient.getQueryData(worksheetsLibraryQueryKey('mine'));
  const cachedItem = Array.isArray(cached)
    ? cached.find((w: { id: string }) => w.id === libraryWorksheetId)
    : undefined;

  const itemQuery = useQuery({
    queryKey: worksheetLibraryEntryQueryKey(libraryWorksheetId),
    queryFn: () => fetchWorksheetLibraryEntry(libraryWorksheetId),
    enabled: Boolean(libraryWorksheetId),
    placeholderData: cachedItem as WorksheetLibraryPreview | undefined,
    staleTime: 25_000,
  });

  const ws = itemQuery.data;
  const previewWorksheet = useMemo(() => (ws ? previewToWorksheet(ws) : null), [ws]);

  const adoptMutation = useMutation({
    mutationFn: (id: string) => adoptWorksheetFromLibrary(id),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: WORKSHEET_LIST_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['worksheets', 'library'] });
      navigate(`/app/worksheets/${created.id}`);
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, stars }: { id: string; stars: number }) => rateWorksheetInLibrary(id, stars),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<WorksheetLibraryPreview | undefined>(
        worksheetLibraryEntryQueryKey(variables.id),
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
      void queryClient.invalidateQueries({ queryKey: ['worksheets', 'library'] });
    },
  });

  const staffUnpublish = useMutation({
    mutationFn: () => backofficeUnpublishWorksheet(libraryWorksheetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: ['worksheets', 'library'] });
      navigate('/app/boards/library', { replace: true });
    },
  });

  const staffDeleteWs = useMutation({
    mutationFn: () => backofficeDeleteWorksheet(libraryWorksheetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('all') });
      void queryClient.invalidateQueries({ queryKey: worksheetsLibraryQueryKey('mine') });
      void queryClient.invalidateQueries({ queryKey: ['worksheets', 'library'] });
      navigate('/app/boards/library', { replace: true });
    },
  });

  const isOwner = Boolean(ws?.viewer_is_owner);
  const errStatus = (itemQuery.error as { response?: { status?: number } })?.response?.status;

  if (!libraryWorksheetId) {
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
          title="Arbeitsblatt nicht gefunden"
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

  if ((!ws || !previewWorksheet) && itemQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <PreviewBackBar />
        <p className="mt-6 text-sm text-[var(--color-ink-500)]">Lade Arbeitsblatt …</p>
      </div>
    );
  }

  if (!ws || !previewWorksheet) {
    return (
      <div className="p-6">
        <EmptyStateMissingSelection />
      </div>
    );
  }

  const cc = ws.comment_count ?? 0;
  const gradeLine = [ws.subject, ws.grade ? `Klasse ${ws.grade}` : ''].filter(Boolean).join(' · ');

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
              <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">{ws.title || 'Ohne Titel'}</p>
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-ink-500)]">
                <span className="min-w-0 truncate">{gradeLine || 'Kein Fach angegeben'}</span>
                <LibraryPlannedDuration minutes={ws.planned_duration_minutes} />
              </p>
            </div>
          </div>
          {!isOwner ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={adoptMutation.isPending && adoptMutation.variables === ws.id}
              disabled={adoptMutation.isPending}
              title="In deine privaten Arbeitsblätter kopieren und bearbeiten"
              aria-label="In meine Sammlung übernehmen"
              leftIcon={<FolderPlus size={16} aria-hidden />}
              onClick={() => adoptMutation.mutate(ws.id)}
            >
              In meine Sammlung
            </Button>
          ) : null}
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
      {staffDeleteWs.isError ? (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <Alert tone="error">Löschen fehlgeschlagen — bitte erneut versuchen.</Alert>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-3 pb-[max(2.5rem,env(safe-area-inset-bottom,12px))] sm:flex-row sm:gap-6 sm:p-5 sm:pb-12 lg:gap-8">
        <section
          className="relative flex min-h-[min(48dvh,420px)] shrink-0 flex-col sm:min-h-[min(60vh,600px)] sm:flex-1 lg:min-h-0 lg:flex-[1.15]"
          aria-label="Arbeitsblatt-Vorschau"
        >
          <Card flush className="flex min-h-0 flex-1 flex-col overflow-hidden !p-0">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--color-bg-muted)] p-3 sm:p-4">
              <div className="mx-auto flex min-w-0 w-full flex-col gap-4">
                {!isOwner ? (
                  <div className="flex justify-end sm:hidden">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={adoptMutation.isPending && adoptMutation.variables === ws.id}
                      disabled={adoptMutation.isPending}
                      leftIcon={<FolderPlus size={14} aria-hidden />}
                      onClick={() => adoptMutation.mutate(ws.id)}
                    >
                      In Sammlung
                    </Button>
                  </div>
                ) : null}
                <div className="flex min-h-0 min-w-0 justify-center">
                  <div className="mx-auto w-fit max-w-full shrink-0 overflow-x-hidden overflow-y-visible rounded-lg border border-slate-200 bg-white shadow-sm">
                    <A4WorksheetRenderer worksheet={previewWorksheet} />
                  </div>
                </div>
              </div>
            </div>
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
                Öffentlichen Eintrag entfernen (bleib beim Autor privat) oder das Arbeitsblatt inkl. Daten endgültig
                löschen.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={staffUnpublish.isPending}
                  disabled={staffUnpublish.isPending || staffDeleteWs.isPending || adoptMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Diesen Eintrag aus der öffentlichen Bibliothek nehmen? (Das Arbeitsblatt bleibt beim Ersteller erhalten.)',
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
                  loading={staffDeleteWs.isPending}
                  disabled={staffDeleteWs.isPending || staffUnpublish.isPending || adoptMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Das Arbeitsblatt wirklich endgültig löschen? Dies kann nicht rückgängig gemacht werden.',
                      )
                    ) {
                      void staffDeleteWs.mutate();
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
                  Dein Arbeitsblatt
                </Badge>
              ) : null}
              <Badge tone="accent" className="!text-[10px]">
                Arbeitsblatt
              </Badge>
              {ws.avg_rating != null && ws.avg_rating >= 4 ? (
                <Badge tone="accent" className="!text-[10px]">
                  Top bewertet
                </Badge>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg-muted)] px-2 py-0.5 text-[11px] text-[var(--color-ink-600)] ring-1 ring-[var(--color-border)]">
                <MessageCircle size={12} aria-hidden /> {cc} Kommentar{cc === 1 ? '' : 'e'}
              </span>
            </div>

            {ws.topic ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-500)]">Thema</p>
                <p className="text-sm leading-snug text-[var(--color-ink-800)]">{ws.topic}</p>
              </div>
            ) : null}

            {ws.description?.trim() ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-500)]">
                  Beschreibung
                </p>
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink-800)]">
                  {ws.description.trim()}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-ink-500)]">Keine zusätzliche Beschreibung hinterlegt.</p>
            )}

            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="mb-1 text-[11px] text-[var(--color-ink-500)]">
                {ws.library_published_at ? (
                  <>
                    In der Bibliothek seit{' '}
                    <span className="font-medium text-[var(--color-ink-700)] tabular-nums">
                      {new Date(ws.library_published_at).toLocaleDateString('de-DE', {
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
            </div>
          </Card>

          <Card className="space-y-2 !p-4">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-500" aria-hidden />
              <p className="text-sm font-semibold text-[var(--color-ink-800)]">Community-Bewertung</p>
            </div>
            <BoardLibraryInteractiveRating
              avgRating={ws.avg_rating}
              ratingCount={ws.rating_count ?? 0}
              myStars={ws.my_stars}
              disabled={rateMutation.isPending}
              onPick={(s) => rateMutation.mutate({ id: ws.id, stars: s })}
            />
          </Card>

          {isOwner ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-muted)]/50 px-3 py-2 text-center text-xs text-[var(--color-ink-600)]">
              Eigenes Arbeitsblatt — Bearbeitung unter <span className="font-medium">Meine Arbeitsblätter</span>.
            </p>
          ) : null}

          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-sm)]">
            <WorksheetLibraryCommentsSection
              worksheetId={ws.id}
              commentCount={cc}
              loadImmediately
              staffModeration={isStaff}
            />
          </div>
        </aside>
      </div>
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
      title="Eintrag auswählen"
      description="Öffne zuerst die Bibliothek und wähle eine Kachel aus."
      action={
        <Button as="link" to="/app/boards/library" variant="secondary">
          Zur Übersicht
        </Button>
      }
    />
  );
}
