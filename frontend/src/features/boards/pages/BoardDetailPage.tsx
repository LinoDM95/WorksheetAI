import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
} from '../../../lib/listQueries';
import { formatDateTime } from '../../../lib/formatDate';
import { Alert, Button } from '../../../components/ui';
import { useAuth } from '../../../lib/authContext';
import {
  applyBoardRevision,
  deleteBoardRevision,
  fetchBoard,
  fetchBoardFolders,
  fetchBoardRevisions,
  reviseBoard,
  revertLastBoardRevision,
  updateBoardCode,
} from '../boardsApi';
import { BoardLibraryPublishModal } from '../components/BoardLibraryPublishModal';
import { BoardFullscreenPreview } from '../components/BoardFullscreenPreview';
import { BoardStudentPresenceBadge } from '../components/BoardStudentPresenceBadge';
import { BoardShareQrModal } from '../components/BoardShareQrModal';
import { BoardStudentSharePrepModal } from '../components/BoardStudentSharePrepModal';
import type { BoardCodeUpdate, BoardDetail, BoardRevision, RevisionMode } from '../types';
import { clearPendingFirstOpenBoard } from '../lib/boardFirstOpenHighlight';
import { defaultLibraryListingCategoryFromBoardType, type LibraryListingCategory } from '../lib/libraryCatalogFilters';
import { needsStudentSharePrep, isStudentShareLinkActive } from '../lib/studentShareFlow';
import { buildStudentBoardUrl } from '../publicBoardApi';
import { BoardDetailMetaPanel } from './boardDetail/BoardDetailMetaPanel';
import { BoardDetailPageHeader } from './boardDetail/BoardDetailPageHeader';
import { BoardDetailReviseTab } from './boardDetail/BoardDetailReviseTab';
import { BoardShellModal } from './boardDetail/BoardShellModal';
import { useAiGenerationJobs } from '../../../components/ai-generation/AiGenerationJobsContext';
import { AI_GENERATION_QUEUE_FULL_MESSAGE } from '../../../components/ai-generation/aiGenerationTypes';
import { isUserCancelledGenerationError } from '../../../components/ai-generation/generationQueue';

export function BoardDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { jobs, startJob, updateJob, completeJob, failJob, runSerialized } = useAiGenerationJobs();

  const [reviseOpen, setReviseOpen] = useState(false);
  const [fatalOpen, setFatalOpen] = useState(false);

  const [reviseError, setReviseError] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [reviseInput, setReviseInput] = useState('');
  const [revisionMode, setRevisionMode] = useState<RevisionMode>('general');
  const [reloadKey, setReloadKey] = useState(0);
  const scriptsEnabled = true;
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);
  const [libraryModalMode, setLibraryModalMode] = useState<'publish' | 'edit_listing' | null>(null);
  const [libraryModalError, setLibraryModalError] = useState<string | null>(null);
  const [libraryShareMessage, setLibraryShareMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaSubject, setMetaSubject] = useState('');
  const [metaTopic, setMetaTopic] = useState('');
  const [metaGradeFrom, setMetaGradeFrom] = useState('');
  const [metaGradeTo, setMetaGradeTo] = useState('');
  const [metaDuration, setMetaDuration] = useState('');
  const [metaFormError, setMetaFormError] = useState<string | null>(null);

  const [shareQrOpen, setShareQrOpen] = useState(false);
  const [sharePrepOpen, setSharePrepOpen] = useState(false);
  const [shareQrPayload, setShareQrPayload] = useState<{
    url: string;
    expiresAt: string | null;
    title: string;
  } | null>(null);
  const boardSharePortalRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    return () => {
      document.body.style.removeProperty('overflow');
    };
  }, [id]);

  useEffect(() => {
    if (id) clearPendingFirstOpenBoard(id);
  }, [id]);

  const { data: board, isPending, isError } = useQuery({
    queryKey: BOARDS_DETAIL_QUERY_KEY(id),
    queryFn: () => fetchBoard(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!board) return;
    setMetaTitle(board.title || '');
    setMetaSubject(board.subject || '');
    setMetaTopic(board.topic || '');
    setMetaGradeFrom(board.grade_from != null ? String(board.grade_from) : '');
    setMetaGradeTo(board.grade_to != null ? String(board.grade_to) : '');
    const dm = board.generation_input?.duration_minutes;
    if (dm != null && typeof dm === 'number') {
      setMetaDuration(String(dm));
    } else if (dm != null) {
      const n = parseInt(String(dm), 10);
      setMetaDuration(Number.isNaN(n) ? '' : String(n));
    } else {
      setMetaDuration('');
    }
    setMetaFormError(null);
  }, [board]);

  const { data: revisions = [] } = useQuery({
    queryKey: ['board-revisions', id],
    queryFn: () => fetchBoardRevisions(id),
    enabled: Boolean(id),
  });

  const revisionHeadId = useMemo(() => {
    if (!board) return null;
    return board.revision_head_id ?? revisions[0]?.id ?? null;
  }, [board, revisions]);

  const previewRevision = useMemo((): BoardRevision | null => {
    if (!board || previewRevisionId === null) return null;
    if (!revisionHeadId || previewRevisionId === revisionHeadId) return null;
    return revisions.find((r) => r.id === previewRevisionId) ?? null;
  }, [board, previewRevisionId, revisionHeadId, revisions]);

  const isHeadView = !previewRevision;

  const iframeBundle = useMemo(() => {
    if (!board) {
      return {
        html: '',
        css: '',
        javascript: '',
        used_libraries: [] as BoardDetail['used_libraries'],
        used_assets: [] as BoardDetail['used_assets'],
        used_datasets: undefined as BoardDetail['used_datasets'] | undefined,
      };
    }
    if (!previewRevision) {
      return {
        html: board.html,
        css: board.css,
        javascript: board.javascript,
        used_libraries: board.used_libraries ?? [],
        used_assets: board.used_assets ?? [],
        used_datasets: board.used_datasets,
      };
    }
    const nm = previewRevision.new_metadata ?? {};
    return {
      html: previewRevision.new_html,
      css: previewRevision.new_css,
      javascript: previewRevision.new_javascript,
      used_libraries: (nm.used_libraries as BoardDetail['used_libraries']) ?? board.used_libraries ?? [],
      used_assets: (nm.used_assets as BoardDetail['used_assets']) ?? board.used_assets ?? [],
      used_datasets: (nm.used_datasets as BoardDetail['used_datasets']) ?? board.used_datasets,
    };
  }, [board, previewRevision]);

  const canReviseWithAi = Boolean((board?.can_revise_with_ai ?? true) && isHeadView);

  const aiBlockedHint =
    'Nur am aktuellen Stand (neueste Version) verfügbar. Wähle oben „Aktueller Stand“ oder übernimm eine Version.';

  useEffect(() => {
    if (!previewRevisionId) return;
    if (!revisions.some((r) => r.id === previewRevisionId)) {
      setPreviewRevisionId(null);
    }
  }, [previewRevisionId, revisions]);

  const { data: folders = [] } = useQuery({
    queryKey: BOARDS_FOLDERS_QUERY_KEY,
    queryFn: fetchBoardFolders,
    staleTime: 60_000,
  });

  const foldersSorted = useMemo(
    () => [...folders].sort((a, b) => a.path.localeCompare(b.path, 'de')),
    [folders],
  );

  const reviseKiJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.kind === 'board-revise' &&
          j.resourceId === id &&
          (j.status === 'queued' || j.status === 'running'),
      ),
    [jobs, id],
  );
  const reviseKiRunning = reviseKiJobs.some((j) => j.status === 'running');
  const reviseKiQueued = reviseKiJobs.some((j) => j.status === 'queued');

  const handleRevise = () => {
    setReviseError(null);
    if (!reviseInput.trim()) {
      setReviseError('Bitte beschreibe deinen Änderungswunsch.');
      return;
    }
    if (!id) return;
    const prompt = reviseInput.trim();
    const mode = revisionMode;
    const jid = startJob({
      kind: 'board-revise',
      title: 'Board wird überarbeitet',
      subtitle: board?.title?.trim() || undefined,
      resourceId: id,
    });
    if (!jid) {
      setReviseError(AI_GENERATION_QUEUE_FULL_MESSAGE);
      return;
    }
    setReviseOpen(false);
    void runSerialized(jid, async (signal) => {
      try {
        updateJob(jid, {
          phaseLabel: 'Die KI passt HTML, CSS und JavaScript an …',
          progressPercent: null,
        });
        await reviseBoard(id, prompt, { revision_mode: mode, signal });
        completeJob(jid, { successMessage: 'Vorschau wurde aktualisiert.' });
        queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
        queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
        queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
        setReviseInput('');
        setRevisionMode('general');
        setRevertError(null);
        setReloadKey((k) => k + 1);
        setPreviewRevisionId(null);
      } catch (err: unknown) {
        if (isUserCancelledGenerationError(err)) return;
        const detail =
          (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail
          || (err as Error)?.message
          || 'Revision fehlgeschlagen.';
        failJob(jid, detail);
        setReviseError(detail);
        setReviseOpen(true);
      }
    });
  };

  const revertMutation = useMutation({
    mutationFn: (revisionId: string) => revertLastBoardRevision(id, revisionId),
    onSuccess: () => {
      setRevertError(null);
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setReloadKey((k) => k + 1);
      setPreviewRevisionId(null);
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } }; message?: string }).response?.data?.detail;
      setRevertError(detail || (err as Error)?.message || 'Zurücksetzen fehlgeschlagen.');
    },
  });

  const applyRevisionMutation = useMutation({
    mutationFn: (revisionId: string) => applyBoardRevision(id, revisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      setPreviewRevisionId(null);
      setReloadKey((k) => k + 1);
    },
  });

  const deleteRevisionMutation = useMutation({
    mutationFn: (revisionId: string) => deleteBoardRevision(id, revisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      setPreviewRevisionId(null);
    },
  });

  const patchMutation = useMutation({
    mutationFn: (body: BoardCodeUpdate) => updateBoardCode(id, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['board-revisions', id] });
      setReloadKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: BOARDS_LIST_QUERY_KEY });
      if (
        variables.library_public !== undefined ||
        variables.library_listing_title !== undefined ||
        variables.library_listing_topic !== undefined ||
        variables.library_listing_description !== undefined ||
        variables.library_listing_category !== undefined ||
        variables.library_sync_public_snapshot ||
        variables.subject !== undefined ||
        variables.topic !== undefined ||
        variables.grade_from !== undefined ||
        variables.grade_to !== undefined ||
        variables.grade !== undefined ||
        variables.duration_minutes !== undefined ||
        variables.title !== undefined
      ) {
        queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
      }
    },
  });

  const showShareQrModalWithPayload = useCallback(
    (payload: { url: string; expiresAt: string | null; title: string }) => {
      setShareQrPayload(payload);
      setShareQrOpen(true);
    },
    [],
  );

  const openExistingShareQr = useCallback(() => {
    if (!board?.share_token || !board.student_link_enabled) return;
    showShareQrModalWithPayload({
      url: buildStudentBoardUrl(board.share_token),
      expiresAt: board.student_link_expires_at ?? null,
      title: board.title || '',
    });
  }, [board, showShareQrModalWithPayload]);

  const handleDetailShareClick = useCallback(() => {
    if (!board || needsStudentSharePrep(board)) {
      setSharePrepOpen(true);
      return;
    }
    openExistingShareQr();
  }, [board, openExistingShareQr]);

  const handleConfirmStudentShare = useCallback(
    (validMinutes: number) => {
      patchMutation.mutate(
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
    [patchMutation, board?.share_token, board?.title],
  );

  const handleResetStudentLinkValidity = useCallback(
    (validMinutes: number) => {
      patchMutation.mutate(
        { student_link_valid_minutes: validMinutes },
        {
          onSuccess: (data) => {
            setShareQrPayload((prev) =>
              prev ? { ...prev, expiresAt: data.student_link_expires_at ?? null } : prev,
            );
            void queryClient.invalidateQueries({ queryKey: BOARDS_DETAIL_QUERY_KEY(id) });
          },
        },
      );
    },
    [patchMutation, queryClient, id],
  );

  const handleSyncPublicLibrarySnapshot = useCallback(() => {
    setLibraryShareMessage(null);
    patchMutation.mutate(
      { library_sync_public_snapshot: true },
      {
        onSuccess: () =>
          setLibraryShareMessage({
            tone: 'info',
            text: 'Die öffentliche Bibliotheksfassung wurde mit deinem aktuellen Arbeitsstand abgeglichen.',
          }),
        onError: (err: unknown) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            (err as Error)?.message ||
            'Aktualisierung fehlgeschlagen.';
          setLibraryShareMessage({ tone: 'error', text: detail });
        },
      },
    );
  }, [patchMutation]);

  const handleSaveBoardMeta = useCallback(() => {
    setMetaFormError(null);
    const ttl = metaTitle.trim();
    const subj = metaSubject.trim();
    const top = metaTopic.trim();
    if (!ttl) {
      setMetaFormError('Titel ist ein Pflichtfeld.');
      return;
    }
    if (!subj) {
      setMetaFormError('Fach ist ein Pflichtfeld.');
      return;
    }
    if (!top) {
      setMetaFormError('Thema ist ein Pflichtfeld.');
      return;
    }
    if (!metaGradeFrom || !metaGradeTo) {
      setMetaFormError('Bitte Klassenstufe „von“ und „bis“ wählen.');
      return;
    }
    const gf = parseInt(metaGradeFrom, 10);
    const gt = parseInt(metaGradeTo, 10);
    if (Number.isNaN(gf) || Number.isNaN(gt) || gf < 1 || gf > 13 || gt < 1 || gt > 13) {
      setMetaFormError('Klassenstufen müssen zwischen 1 und 13 liegen.');
      return;
    }
    const d = parseInt(metaDuration.trim(), 10);
    if (!metaDuration.trim() || Number.isNaN(d) || d < 5 || d > 90) {
      setMetaFormError('Geplante Dauer: bitte eine ganze Zahl zwischen 5 und 90.');
      return;
    }
    patchMutation.mutate(
      {
        title: ttl.slice(0, 255),
        subject: subj,
        topic: top,
        grade_from: gf,
        grade_to: gt,
        duration_minutes: d,
      },
      {
        onError: (err: unknown) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            (err as Error)?.message ||
            'Speichern fehlgeschlagen.';
          setMetaFormError(detail);
        },
      },
    );
  }, [metaDuration, metaGradeFrom, metaGradeTo, metaSubject, metaTitle, metaTopic, patchMutation]);

  const handleSubmitLibraryUpdate = useCallback(() => {
    if (!board) return;
    const lt = (board.library_listing_title || board.title || '').trim();
    const lk = (board.library_listing_topic || board.topic || '').trim();
    const ld = (board.library_listing_description || board.description || '').trim();
    if (!lt || !lk || !ld) {
      setLibraryShareMessage({
        tone: 'error',
        text: 'Bitte zuerst unter „Bibliotheks-Texte“ einen öffentlichen Titel, ein Thema und eine Beschreibung hinterlegen.',
      });
      return;
    }
    setLibraryShareMessage(null);
    patchMutation.mutate(
      {
        library_public: true,
        library_listing_title: lt,
        library_listing_topic: lk,
        library_listing_description: ld,
      },
      {
        onError: (err: unknown) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            (err as Error)?.message ||
            'Einreichen fehlgeschlagen.';
          setLibraryShareMessage({ tone: 'error', text: detail });
        },
        onSuccess: () => {
          setLibraryShareMessage({
            tone: 'info',
            text: 'Update wurde zur Prüfung eingereicht. Die öffentliche Karte zeigt vorerst noch die letzte freigegebene Fassung.',
          });
        },
      },
    );
  }, [board, patchMutation]);

  const handleRevertRevision = () => {
    const latestId = revisions[0]?.id;
    if (!latestId) return;
    const confirmed = window.confirm(
      'Stand vor der letzten KI-Überarbeitung wiederherstellen? Die aktuelle Fassung wird dabei verworfen.',
    );
    if (!confirmed) return;
    setRevertError(null);
    revertMutation.mutate(latestId);
  };

  const handleConfirmDeleteRevision = (revisionId: string) => {
    const confirmed = window.confirm(
      'Diesen Versionseintrag aus der Historie löschen? Der aktuelle Board-Stand bleibt unverändert.',
    );
    if (!confirmed) return;
    deleteRevisionMutation.mutate(revisionId);
  };

  const reviseBlockedTitle: string | undefined = !canReviseWithAi
    ? !isHeadView
      ? aiBlockedHint
      : 'Änderungen speichern, bis der Stand wieder der neuesten Version entspricht.'
    : undefined;

  const reviseButtonTitle: string | undefined = canReviseWithAi
    ? 'In eigenen Worten beschreiben, was sich am Board ändern soll — die KI liefert eine neue Fassung aus HTML, CSS und JavaScript.'
    : reviseBlockedTitle;

  const handleWithdrawFromLibrary = useCallback(() => {
    const ok = window.confirm(
      'Dieses Board aus der öffentlichen Bibliothek nehmen? Der Eintrag ist danach für andere nicht mehr sichtbar.',
    );
    if (!ok) return;
    setLibraryShareMessage(null);
    patchMutation.mutate(
      { library_public: false },
      {
        onError: (err: unknown) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            (err as Error)?.message ||
            'Konnte nicht entfernt werden.';
          setLibraryShareMessage({ tone: 'error', text: detail });
        },
      },
    );
  }, [patchMutation]);

  if (isPending) {
    return (
      <div className="flex min-h-[12rem] flex-1 items-center justify-center text-sm text-slate-500 lg:min-h-0">
        Lade Board …
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-4 px-4 lg:min-h-0">
        <Alert tone="error">Board konnte nicht geladen werden.</Alert>
        <Button variant="secondary" onClick={() => navigate('/app/boards')}>
          Zurück zur Galerie
        </Button>
      </div>
    );
  }

  const showFatalErrors = (board.validation_errors || []).length > 0;

  const publicOnlineVersionLabel =
    board.library_snapshot_at != null && String(board.library_snapshot_at).trim() !== ''
      ? formatDateTime(board.library_snapshot_at)
      : board.library_published_at
        ? formatDateTime(board.library_published_at)
        : '—';

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-x-hidden bg-[var(--color-bg-app)]">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <BoardDetailPageHeader
          board={board}
          showFatalErrors={showFatalErrors}
          onOpenFatalDetails={() => setFatalOpen(true)}
          foldersSorted={foldersSorted}
          revisions={revisions}
          previewRevisionId={previewRevisionId}
          onPreviewRevisionChange={setPreviewRevisionId}
          previewRevision={previewRevision}
          applyRevisionPending={applyRevisionMutation.isPending}
          onApplyRevision={(rid) => applyRevisionMutation.mutate(rid)}
          deleteRevisionPending={deleteRevisionMutation.isPending}
          onDeleteRevisionEntry={handleConfirmDeleteRevision}
          canReviseWithAi={canReviseWithAi}
          reviseButtonTitle={reviseButtonTitle}
          reviseBlockedTitle={reviseBlockedTitle}
          onOpenRevise={() => setReviseOpen(true)}
          libraryShareMessage={libraryShareMessage}
          userIsStaff={Boolean(user?.is_staff)}
          publicOnlineVersionLabel={publicOnlineVersionLabel}
          onSyncPublicLibrarySnapshot={handleSyncPublicLibrarySnapshot}
          onSubmitLibraryUpdate={handleSubmitLibraryUpdate}
          onOpenLibraryModal={(mode) => {
            setLibraryModalError(null);
            setLibraryModalMode(mode);
          }}
          onWithdrawFromLibrary={handleWithdrawFromLibrary}
          patchMutation={patchMutation}
        />
        <BoardDetailMetaPanel
          board={board}
          metaTitle={metaTitle}
          setMetaTitle={setMetaTitle}
          metaSubject={metaSubject}
          setMetaSubject={setMetaSubject}
          metaTopic={metaTopic}
          setMetaTopic={setMetaTopic}
          metaGradeFrom={metaGradeFrom}
          setMetaGradeFrom={setMetaGradeFrom}
          metaGradeTo={metaGradeTo}
          setMetaGradeTo={setMetaGradeTo}
          metaDuration={metaDuration}
          setMetaDuration={setMetaDuration}
          metaFormError={metaFormError}
          onSaveMeta={handleSaveBoardMeta}
          savePending={patchMutation.isPending}
        />

      <BoardFullscreenPreview
        className="min-h-0 flex-1"
        layoutKey={id}
        viewTransitionGroupName="board-editor-fs-root"
        reloadKey={reloadKey}
        onReload={() => setReloadKey((k) => k + 1)}
        html={iframeBundle.html}
        css={iframeBundle.css}
        javascript={iframeBundle.javascript}
        boardFrameId={board.id}
        usedLibraries={iframeBundle.used_libraries ?? []}
        usedDatasets={iframeBundle.used_datasets}
        scriptsEnabled={scriptsEnabled}
        shareOverlayPortalRef={boardSharePortalRef}
        shareToolbarAction={{
          onClick: handleDetailShareClick,
          disabled: !isHeadView || board.viewer_is_owner === false,
          loading: patchMutation.isPending && sharePrepOpen,
          title: isHeadView ? undefined : aiBlockedHint,
          ariaLabel: isHeadView ? undefined : aiBlockedHint,
        }}
        toolbarExtras={
          isStudentShareLinkActive(board) ? (
            <BoardStudentPresenceBadge boardId={board.id} enabled variant="light" />
          ) : null
        }
      />
      </div>

      <BoardShellModal
        open={reviseOpen}
        title="Board per KI überarbeiten"
        onClose={() => {
          setReviseOpen(false);
          setReviseError(null);
        }}
        wide
      >
        <BoardDetailReviseTab
          value={reviseInput}
          onChange={setReviseInput}
          mode={revisionMode}
          onModeChange={setRevisionMode}
          error={reviseError}
          revertError={revertError}
          busyRunning={reviseKiRunning}
          busyQueued={reviseKiQueued}
          revertBusy={revertMutation.isPending}
          canRevert={isHeadView && revisions.length > 0}
          onRevert={handleRevertRevision}
          onSubmit={handleRevise}
          board={board}
          autoFocus
        />
      </BoardShellModal>

      <BoardShellModal open={fatalOpen} title="Validierungsfehler" onClose={() => setFatalOpen(false)}>
        <Alert tone="error">
          <ul className="list-inside list-disc text-sm">
            {board.validation_errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </Alert>
      </BoardShellModal>

      <BoardStudentSharePrepModal
        open={sharePrepOpen}
        onClose={() => setSharePrepOpen(false)}
        onConfirm={handleConfirmStudentShare}
        busy={patchMutation.isPending}
        portalRootRef={boardSharePortalRef}
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
        onResetValidity={handleResetStudentLinkValidity}
        resetBusy={patchMutation.isPending}
        portalRootRef={boardSharePortalRef}
      />

      {board ? (
        <BoardLibraryPublishModal
          open={libraryModalMode !== null}
          mode={libraryModalMode === 'edit_listing' ? 'edit_listing' : 'publish'}
          onClose={() => {
            if (patchMutation.isPending) return;
            setLibraryModalMode(null);
            setLibraryModalError(null);
          }}
          busy={patchMutation.isPending}
          error={libraryModalError}
          privateHints={{ title: board.title, topic: board.topic }}
          boardTypeHint={board.board_type}
          initialListing={
            libraryModalMode === 'edit_listing'
              ? (() => {
                  const raw = board.library_listing_category;
                  const listingCategory: LibraryListingCategory =
                    raw === 'tasks' || raw === 'games' || raw === 'presentations'
                      ? raw
                      : defaultLibraryListingCategoryFromBoardType(board.board_type);
                  return {
                    library_listing_title: board.library_listing_title ?? '',
                    library_listing_topic: board.library_listing_topic ?? '',
                    library_listing_description: board.library_listing_description ?? '',
                    library_listing_category: listingCategory,
                  };
                })()
              : undefined
          }
          onSubmit={(p) => {
            if (libraryModalMode === 'publish') {
              patchMutation.mutate(
                { library_public: true, ...p },
                {
                  onSuccess: () => {
                    setLibraryModalMode(null);
                    setLibraryModalError(null);
                  },
                  onError: (err: unknown) => {
                    const detail =
                      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                      (err as Error)?.message ||
                      'Veröffentlichen fehlgeschlagen.';
                    setLibraryModalError(detail);
                  },
                },
              );
              return;
            }
            if (libraryModalMode === 'edit_listing') {
              patchMutation.mutate(
                { ...p },
                {
                  onSuccess: () => {
                    setLibraryModalMode(null);
                    setLibraryModalError(null);
                  },
                  onError: (err: unknown) => {
                    const detail =
                      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                      (err as Error)?.message ||
                      'Speichern fehlgeschlagen.';
                    setLibraryModalError(detail);
                  },
                },
              );
            }
          }}
          moderationRequired={!user?.is_staff}
        />
      ) : null}
    </div>
  );
}
