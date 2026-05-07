import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Trash2 } from 'lucide-react';
import { Button, Field, IconButton } from '../../../../components/ui';
import { formatRelative } from '../../../../lib/formatDate';
import { boardsLibraryCommentsQueryKey, boardLibraryEntryQueryKey } from '../../../../lib/listQueries';
import { cn } from '../../../../lib/cn';
import { backofficeDeleteBoardLibraryComment, fetchBoardLibraryComments, postBoardLibraryComment } from '../../boardsApi';

const COMMENT_MAX = 2000;

export function BoardLibraryCommentsSection({
  boardId,
  commentCount,
  loadImmediately = false,
  staffModeration = false,
}: {
  boardId: string;
  commentCount: number;
  loadImmediately?: boolean;
  /** Admin/Staff: Kommentare einzeln löschen. */
  staffModeration?: boolean;
}) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [loadComments, setLoadComments] = useState(() => loadImmediately || commentCount > 0);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (loadImmediately) setLoadComments(true);
  }, [loadImmediately]);

  useEffect(() => {
    if (commentCount > 0) setLoadComments(true);
  }, [commentCount]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || loadComments || loadImmediately) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setLoadComments(true);
      },
      { root: null, rootMargin: '140px 0px', threshold: 0.02 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadComments, loadImmediately]);

  const q = useQuery({
    queryKey: boardsLibraryCommentsQueryKey(boardId),
    queryFn: () => fetchBoardLibraryComments(boardId),
    enabled: loadComments,
    staleTime: 20_000,
  });

  const postMut = useMutation({
    mutationFn: (text: string) => postBoardLibraryComment(boardId, text),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: boardsLibraryCommentsQueryKey(boardId) });
      void queryClient.invalidateQueries({ queryKey: boardLibraryEntryQueryKey(boardId) });
      void queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (commentId: string) => backofficeDeleteBoardLibraryComment(boardId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: boardsLibraryCommentsQueryKey(boardId) });
      void queryClient.invalidateQueries({ queryKey: boardLibraryEntryQueryKey(boardId) });
      void queryClient.invalidateQueries({ queryKey: ['boards', 'library'] });
    },
  });

  const count = commentCount;
  const rows = q.data ?? [];

  return (
    <div
      ref={rootRef}
      className="border-t border-[var(--color-border)] bg-[var(--color-bg-muted)]/30 px-4 py-4 sm:px-5"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-800)]">
        <MessageCircle size={17} className="text-indigo-600" aria-hidden />
        Kommentare
        <span className="rounded-full bg-[var(--color-bg-card)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink-500)] ring-1 ring-[var(--color-border)]">
          {count}
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-ink-500)]">
        Alle Beiträge erscheinen als <span className="font-medium text-[var(--color-ink-700)]">Anonym</span> — keine
        Namen oder Kontaktdaten sichtbar.
        {staffModeration ? (
          <span className="mt-1 block font-medium text-red-800">
            Als Administratorin kannst du einzelne Kommentare entfernen.
          </span>
        ) : null}
      </p>

      {loadComments ? (
        q.isError ? (
          <p className="text-sm text-red-700">Kommentare konnten nicht geladen werden.</p>
        ) : q.isPending ? (
          <p className="text-sm text-[var(--color-ink-500)]">Lade Kommentare …</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-500)]">Noch keine Kommentare — schreib den Ersten.</p>
        ) : (
          <ul
            className="mb-4 max-h-52 space-y-3 overflow-y-auto overscroll-contain pr-1 text-sm"
            aria-label="Liste der Kommentare"
          >
            {rows.map((c) => (
              <li
                key={c.id}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 shadow-[var(--shadow-sm)]"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-ink-500)]">
                  <span className="font-semibold text-[var(--color-ink-700)]">Anonym</span>
                  <span className="flex items-center gap-1.5">
                    <time dateTime={c.created_at} className="tabular-nums text-[var(--color-ink-400)]">
                      {formatRelative(c.created_at)}
                    </time>
                    {staffModeration ? (
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 !text-red-700 hover:bg-red-50"
                        aria-label="Kommentar löschen"
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (window.confirm('Diesen Kommentar endgültig entfernen?')) {
                            void deleteMut.mutateAsync(c.id);
                          }
                        }}
                      >
                        <Trash2 size={16} aria-hidden />
                      </IconButton>
                    ) : null}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-ink-800)]">
                  {c.text}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="mb-4 text-sm text-[var(--color-ink-500)]">Kommentare werden geladen, wenn der Eintrag sichtbar wird …</p>
      )}

      <Field
        label="Kommentar hinzufügen"
        htmlFor={`lib-comment-${boardId}`}
        help={`Max. ${COMMENT_MAX} Zeichen.`}
      >
        <textarea
          id={`lib-comment-${boardId}`}
          className={cn(
            'min-h-[88px] w-full resize-y rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-ink-900)] shadow-sm outline-none transition placeholder:text-[var(--color-ink-400)] focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1',
            postMut.isError && 'border-red-300',
          )}
          maxLength={COMMENT_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Feedback, Ideen oder Dankeschön für Kolleg:innen …"
          disabled={postMut.isPending}
          aria-invalid={postMut.isError}
          onFocus={() => setLoadComments(true)}
        />
      </Field>
      {postMut.isError ? (
        <p className="mt-2 text-[12px] text-red-700">
          {(postMut.error as Error)?.message || 'Kommentar konnte nicht gesendet werden.'}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          loading={postMut.isPending}
          disabled={postMut.isPending || draft.trim().length < 1}
          onClick={() => postMut.mutate(draft.trim())}
        >
          Kommentar absenden
        </Button>
      </div>
    </div>
  );
}
