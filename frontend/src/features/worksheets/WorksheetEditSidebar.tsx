import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bold,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Italic,
  RemoveFormatting,
  Sparkles,
  Underline,
  X,
} from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { isUserCancelledGenerationError } from '../../components/ai-generation/generationQueue';
import {
  appendDraftPage,
  createDefaultWorksheetBlock,
  insertDraftBlock,
  insertDraftChecklistItem,
  insertDraftTaskGridItem,
  insertDraftTaskListItem,
  removeDraftBlock,
  removeDraftChecklistItem,
  removeDraftPage,
  removeDraftTaskGridItem,
  removeDraftTaskListItem,
  reorderDraftBlockItems,
  reorderDraftBlocksOnPage,
  updateDraftRoot,
  WORKSHEET_BLOCK_OPTIONS,
  type WorksheetBlockKind,
  isCreativeHtmlWorksheetContent,
} from '../../lib/contentDraft';
import {
  buildCreativePageHtmlFromFlowSnippets,
  creativeFlowSnippetHostInnerHtmlLines,
  creativeFlowSnippetSetHostInnerHtmlLines,
  creativeFlowSnippetToPlainText,
  creativeFlowTeacherRichUnchanged,
  parseCreativeFlowItemHtmlSnippets,
  reorderFlowSnippets,
  sanitizeCreativeFlowHostInnerHtml,
} from '../../lib/creativeHtmlFlow';
import { cn } from '../../lib/cn';
import { WorksheetBlockFields, WorksheetContentEditor } from './WorksheetContentEditor';

const blockTypeLabel = (t: string) =>
  WORKSHEET_BLOCK_OPTIONS.find((o) => o.value === t)?.label ?? t;

function setBlockInDraft(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  block: Record<string, unknown>,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks: Record<string, unknown>[] }[];
  if (!pages[pageIndex]?.blocks?.[blockIndex]) return draft;
  const bl = [...pages[pageIndex].blocks];
  bl[blockIndex] = block;
  pages[pageIndex] = { ...pages[pageIndex], blocks: bl };
  next.pages = pages;
  return next;
}

function CreativeFlowFormatToolbar({
  disabled,
  onBold,
  onItalic,
  onUnderline,
  onClearFormatting,
}: {
  disabled: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onClearFormatting: () => void;
}) {
  const preventCaretLoss = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
  };

  const btnClass =
    'inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      role="toolbar"
      aria-label="Textformatierung"
      className="mb-3 mt-1 flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-1 shadow-sm"
    >
      <button
        type="button"
        disabled={disabled}
        className={btnClass}
        onMouseDown={preventCaretLoss}
        onClick={onBold}
        aria-label="Fett"
        title="Fett"
      >
        <Bold className="h-4 w-4" strokeWidth={2.35} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={btnClass}
        onMouseDown={preventCaretLoss}
        onClick={onItalic}
        aria-label="Kursiv"
        title="Kursiv"
      >
        <Italic className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={btnClass}
        onMouseDown={preventCaretLoss}
        onClick={onUnderline}
        aria-label="Unterstrichen"
        title="Unterstrichen"
      >
        <Underline className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={btnClass}
        onMouseDown={preventCaretLoss}
        onClick={onClearFormatting}
        aria-label="Formatierung entfernen"
        title="Formatierung entfernen"
      >
        <RemoveFormatting className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

function CreativeFlowHostLineField({
  index,
  value,
  lineRefs,
  ariaLabel,
  onLineFocus,
  onLineBlur,
  onLineInput,
}: {
  index: number;
  value: string;
  lineRefs: MutableRefObject<(HTMLDivElement | null)[]>;
  ariaLabel: string;
  onLineFocus: (i: number) => void;
  onLineBlur: (e: FocusEvent<HTMLDivElement>) => void;
  onLineInput: () => void;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const focusedRef = useRef(false);

  useLayoutEffect(() => {
    if (focusedRef.current) return;
    const el = innerRef.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  return (
    <div
      ref={(el) => {
        innerRef.current = el;
        lineRefs.current[index] = el;
      }}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-creative-flow-line
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className="input-multiline min-h-[2.75rem] w-full text-[13px] leading-relaxed outline-none"
      onFocus={() => {
        focusedRef.current = true;
        onLineFocus(index);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        onLineBlur(e);
      }}
      onInput={onLineInput}
    />
  );
}

function SortableCreativeFlowRow({
  id,
  flowIndex,
  snippet,
  isOpen,
  onToggle,
  onCommitRich,
  onRemove,
}: {
  id: string;
  flowIndex: number;
  snippet: string;
  isOpen: boolean;
  onToggle: () => void;
  onCommitRich: (linesHtml: string[]) => void;
  onRemove: () => void;
}) {
  const [linesHtml, setLinesHtml] = useState(() => creativeFlowSnippetHostInnerHtmlLines(snippet));
  const linesHtmlRef = useRef(linesHtml);
  linesHtmlRef.current = linesHtml;

  const rowFocusedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeLineIndexRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rowFocusedRef.current) return;
    setLinesHtml(creativeFlowSnippetHostInnerHtmlLines(snippet));
  }, [snippet]);

  useEffect(
    () => () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
    },
    [],
  );

  const collectFromDom = (): string[] => {
    const n = linesHtmlRef.current.length;
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const el = lineRefs.current[i];
      out.push(sanitizeCreativeFlowHostInnerHtml(el?.innerHTML ?? linesHtmlRef.current[i] ?? ''));
    }
    return out;
  };

  const flushCommit = () => {
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const collected = collectFromDom();
    linesHtmlRef.current = collected;
    setLinesHtml(collected);
    onCommitRich(collected);
  };

  const scheduleCommit = () => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const collected = collectFromDom();
      linesHtmlRef.current = collected;
      setLinesHtml(collected);
      onCommitRich(collected);
    }, 120);
  };

  const handleLineBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (panelRef.current?.contains(next)) return;
    rowFocusedRef.current = false;
    activeLineIndexRef.current = null;
    flushCommit();
  };

  const runCmd = (cmd: 'bold' | 'italic' | 'underline' | 'removeFormat') => {
    let i = activeLineIndexRef.current;
    if (i == null && linesHtmlRef.current.length > 0) {
      i = 0;
      activeLineIndexRef.current = 0;
    }
    if (i == null) return;
    const el = lineRefs.current[i];
    el?.focus();
    try {
      document.execCommand(cmd, false);
    } catch {
      /* noop */
    }
    scheduleCommit();
  };

  const summary =
    creativeFlowSnippetToPlainText(snippet).trim().split(/\r?\n/)[0]?.slice(0, 42) ||
    `Abschnitt ${flowIndex + 1}`;

  return (
    <SortableBlockShell
      id={id}
      dragHandle={<GripVertical className="h-4 w-4" aria-hidden />}
      header={
        <div className="flex min-w-0 items-center gap-1 pr-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-slate-50"
            onClick={onToggle}
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            )}
            <span className="shrink-0 rounded bg-slate-200/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700">
              abschnitt
            </span>
            <span className="truncate text-xs font-medium text-slate-800">{summary}</span>
          </button>
          <IconButton
            type="button"
            variant="danger"
            size="sm"
            className="!h-7 !w-7 shrink-0"
            aria-label={`Abschnitt ${flowIndex + 1} entfernen`}
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </IconButton>
        </div>
      }
      panel={
        isOpen ? (
          <div
            ref={panelRef}
            className="border-t border-slate-100/90 bg-slate-50/40 px-4 pb-4 pt-3"
          >
            <span className="field-label text-[11px]" id={`ws-cr-flow-label-${id}`}>
              Aufgabe / Abschnitt {flowIndex + 1}
            </span>
            <CreativeFlowFormatToolbar
              disabled={linesHtml.length === 0}
              onBold={() => runCmd('bold')}
              onItalic={() => runCmd('italic')}
              onUnderline={() => runCmd('underline')}
              onClearFormatting={() => runCmd('removeFormat')}
            />
            <div className="mt-1 space-y-3" role="group" aria-labelledby={`ws-cr-flow-label-${id}`}>
              {linesHtml.map((lineVal, lineIndex) => (
                <CreativeFlowHostLineField
                  key={`${id}-line-${lineIndex}`}
                  index={lineIndex}
                  value={lineVal}
                  lineRefs={lineRefs}
                  ariaLabel={`Textfeld ${lineIndex + 1} von ${linesHtml.length} im Abschnitt ${flowIndex + 1}`}
                  onLineFocus={(i) => {
                    rowFocusedRef.current = true;
                    activeLineIndexRef.current = i;
                  }}
                  onLineBlur={handleLineBlur}
                  onLineInput={scheduleCommit}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-600">
              Pro Zeile ein bearbeitbares Feld (Überschrift, Zelle, Listenpunkt …). Symbolleiste: Fett, Kursiv,
              Unterstrichen — Vorschau aktualisiert sich kurz nach dem Tippen.
            </p>
          </div>
        ) : null
      }
    />
  );
}

function SortableBlockShell({
  id,
  dragHandle,
  header,
  panel,
}: {
  id: string;
  dragHandle: ReactNode;
  header: ReactNode;
  panel: ReactNode | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
    zIndex: isDragging ? 2 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100/80">
      <div className="flex items-stretch gap-1 px-2 py-2">
        <button
          type="button"
          className="mt-0.5 flex h-8 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 active:cursor-grabbing"
          aria-label="Block verschieben"
          {...attributes}
          {...listeners}
        >
          {dragHandle}
        </button>
        <div className="min-w-0 flex-1">{header}</div>
      </div>
      {panel}
    </div>
  );
}

function WorksheetKiEditPanel({
  pageNumber1Based,
  open,
  kiRunning,
  kiQueued,
  input,
  onInputChange,
  messages,
  onSend,
}: {
  pageNumber1Based: number;
  open: boolean;
  kiRunning: boolean;
  kiQueued?: boolean;
  input: string;
  onInputChange: (v: string) => void;
  messages: { role: 'user' | 'assistant'; text: string }[];
  onSend: () => void;
}) {
  if (!open) return null;
  const sendLabel =
    kiQueued && !kiRunning ? 'In Warteschlange …' : kiRunning ? 'KI arbeitet …' : 'Anweisung senden';
  return (
    <div
      className="mt-2 rounded-xl border border-indigo-200/90 bg-indigo-50/50 px-3 py-3"
      role="region"
      aria-label={`KI-Hilfe für Seite ${pageNumber1Based}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900">KI-Chat · nur diese Seite</p>
      <p className="mt-1 text-[10px] leading-snug text-indigo-950/85">
        Beschreib präzise, was geändert werden soll. Pro Seite kannst du eigene Anweisungen losschicken; mehrere
        Anfragen laufen automatisch nacheinander in der App-Warteschlange. Auf dieser Seite bleiben der Chat-Verlauf
        und Hinweise sichtbar.
      </p>
      <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded-lg border border-white/90 bg-white/80 px-2 py-2">
        {messages.length === 0 ? (
          <p className="text-[10px] text-slate-500">Noch keine Nachrichten in dieser Sitzung.</p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'rounded-md px-2 py-1.5 text-[11px] leading-snug',
                m.role === 'user' ? 'bg-slate-100 text-slate-900' : 'bg-emerald-50/95 text-emerald-950',
              )}
            >
              <span className="font-semibold">{m.role === 'user' ? 'Du' : 'System'}</span>
              <span className="mt-0.5 block whitespace-pre-wrap">{m.text}</span>
            </div>
          ))
        )}
      </div>
      <label className="sr-only" htmlFor={`ws-ki-draft-${pageNumber1Based}`}>
        Anweisung an die KI für Seite {pageNumber1Based}
      </label>
      <textarea
        id={`ws-ki-draft-${pageNumber1Based}`}
        className="input mt-2 min-h-[72px] text-[12px]"
        placeholder="z. B.: „Aufgabe 2 kürzen“, „Tippfehler im Titel beheben“ …"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-primary mt-2 w-full text-[12px] disabled:opacity-60"
        disabled={!input.trim()}
        onClick={onSend}
      >
        {sendLabel}
      </button>
    </div>
  );
}

type NativeRowDragProps = {
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
};

/** Einfache Zeilen mit nativer Drag-and-Drop-API (kein verschachteltes @dnd-kit). */
function DraggableItemRows({
  count,
  onReorder,
  renderRow,
}: {
  count: number;
  onReorder: (from: number, to: number) => void;
  renderRow: (index: number, drag: NativeRowDragProps) => ReactNode;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const rowDragProps = (index: number): NativeRowDragProps => ({
    draggable: true,
    onDragStart: () => setDragFrom(index),
    onDragEnd: () => setDragFrom(null),
  });

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragFrom;
            setDragFrom(null);
            if (from === null || from === i) return;
            onReorder(from, i);
          }}
        >
          {renderRow(i, rowDragProps(i))}
        </div>
      ))}
    </>
  );
}

type SidebarProps = {
  draft: Record<string, unknown>;
  setDraft: (fn: SetStateAction<Record<string, unknown>>) => void;
  displayTitle: string;
  err: string;
  /** DOM-Messung A4: Seiten mit Inhaltsüberlauf (nur Bearbeiten). */
  pageLayoutOverflow?: Record<number, { vertical: boolean; horizontal: boolean; px: number }>;
  /** Im ResizableEditorDock kein verschachteltes <aside> */
  rootElement?: 'aside' | 'div';
  /** Eine Seite (Standard oder Kreativ HTML) mit KI nachbearbeiten — Anweisung der Lehrkraft. */
  onRegenerateWorksheetPage?: (pageIndex: number, teacherInstruction: string) => Promise<void>;
  /** KI-Zustand nur für die jeweilige Seite — `running` = aktiv am Netzwerk; `queued` = nur in der globalen Warteschlange. */
  worksheetPageKiUi?: (pageIndex: number) => { running: boolean; queued: boolean };
};

export function WorksheetEditSidebar({
  draft,
  setDraft,
  displayTitle,
  err,
  pageLayoutOverflow = {},
  rootElement = 'aside',
  onRegenerateWorksheetPage,
  worksheetPageKiUi,
}: SidebarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const overflowEntries = Object.entries(pageLayoutOverflow).filter(
    ([, v]) => v.vertical || v.horizontal,
  );

  const pages = (draft.pages as { page_label?: string; blocks: Record<string, unknown>[] }[]) || [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [insertKind, setInsertKind] = useState<Record<number, WorksheetBlockKind>>({});
  const [kiPanelOpen, setKiPanelOpen] = useState<Record<number, boolean>>({});
  const [kiDraft, setKiDraft] = useState<Record<number, string>>({});
  const [kiChatLog, setKiChatLog] = useState<Record<number, { role: 'user' | 'assistant'; text: string }[]>>({});

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleKiSend = (pageIndex: number) => {
    if (!onRegenerateWorksheetPage) return;
    const text = (kiDraft[pageIndex] ?? '').trim();
    if (!text) return;
    setKiChatLog((prev) => ({
      ...prev,
      [pageIndex]: [...(prev[pageIndex] ?? []), { role: 'user', text }],
    }));
    setKiDraft((prev) => ({ ...prev, [pageIndex]: '' }));
    void (async () => {
      try {
        await onRegenerateWorksheetPage(pageIndex, text);
        setKiChatLog((prev) => ({
          ...prev,
          [pageIndex]: [...(prev[pageIndex] ?? []), { role: 'assistant', text: 'Änderungen wurden übernommen.' }],
        }));
      } catch (e: unknown) {
        if (isUserCancelledGenerationError(e)) {
          setKiChatLog((prev) => ({
            ...prev,
            [pageIndex]: [
              ...(prev[pageIndex] ?? []),
              {
                role: 'assistant',
                text: 'Aus der Warteschlange entfernt — die Seite wurde nicht geändert.',
              },
            ],
          }));
          return;
        }
        setKiChatLog((prev) => ({
          ...prev,
          [pageIndex]: [
            ...(prev[pageIndex] ?? []),
            {
              role: 'assistant',
              text: 'Anfrage fehlgeschlagen — siehe roter Hinweis oben in der Seitenleiste.',
            },
          ],
        }));
      }
    })();
  };

  if (isCreativeHtmlWorksheetContent(draft)) {
    const cPages = (draft.pages as { page_label?: string; html?: string }[]) || [];
    const applyCreativeSnippets = (pageIndex: number, snippets: string[]) => {
      setDraft((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
        const pg = (next.pages as Record<string, unknown>[])[pageIndex];
        if (pg) {
          (next.pages as Record<string, unknown>[])[pageIndex] = {
            ...pg,
            html: buildCreativePageHtmlFromFlowSnippets(snippets),
          };
        }
        return next;
      });
    };
    const setPageLabelCreative = (pageIndex: number, page_label: string) => {
      setDraft((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
        const pg = (next.pages as Record<string, unknown>[])[pageIndex];
        if (pg) (next.pages as Record<string, unknown>[])[pageIndex] = { ...pg, page_label };
        return next;
      });
    };

    const handleCreativeFlowDragEnd = (pageIndex: number, snippets: string[]) => (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const flowIds = snippets.map((_, i) => `creative-flow-${pageIndex}-${i}`);
      const oldIndex = flowIds.indexOf(String(active.id));
      const newIndex = flowIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      applyCreativeSnippets(pageIndex, reorderFlowSnippets(snippets, oldIndex, newIndex));
    };

    const Root = rootElement;
    return (
      <Root
        id="worksheet-edit-sidebar"
        className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-bg-card)]"
        aria-label="Struktur bearbeiten"
        {...(rootElement === 'div' ? { role: 'complementary' as const } : {})}
      >
        <div className="shrink-0 space-y-2 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--color-ink-900)]">Bearbeitung</h2>
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-500)]" title={displayTitle}>
                Inhalt &amp; Reihenfolge
              </p>
            </div>
          </div>
          {err ? (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800"
              role="alert"
            >
              {err}
            </div>
          ) : null}
          {overflowEntries.length > 0 ? (
            <div
              className="rounded-md border border-[var(--color-warn-700)]/30 bg-[var(--color-warn-50)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-warn-700)]"
              role="status"
              aria-live="polite"
            >
              <span className="block font-semibold">A4-Überlauf erkannt</span>
              <span className="mt-0.5 block text-[10px] font-normal leading-snug">
                {`${overflowEntries
                  .map(([idx, v]) => {
                    const n = Number(idx) + 1;
                    const parts: string[] = [];
                    if (v.vertical)
                      parts.push(
                        `Seite ${n}: Inhalt höher als Druckbereich (ca. ${Math.max(1, Math.round(v.px * 0.264))} mm abgeschnitten)`,
                      );
                    if (v.horizontal) parts.push(`Seite ${n}: möglicher Querüberlauf`);
                    return parts.join(' · ');
                  })
                  .join('; ')}. Bitte kürzen, Zeilen reduzieren oder Inhalt auf die nächste Seite verschieben.`}
              </span>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--color-bg-app)]/40 px-4 py-4">
          <section className="card p-4 shadow-sm">
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-500)]">Titel</h3>
            <label htmlFor="ws-edit-title-cr" className="field-label mt-2 text-[12px]">
              Arbeitsblatt-Titel
            </label>
            <input
              id="ws-edit-title-cr"
              className="input"
              value={String(draft.title ?? '')}
              onChange={(e) => setDraft((prev) => updateDraftRoot(prev, { title: e.target.value }))}
            />
            <label htmlFor="ws-edit-sub-cr" className="field-label mt-3 text-[12px]">
              Untertitel
            </label>
            <input
              id="ws-edit-sub-cr"
              className="input"
              value={String(draft.subtitle ?? '')}
              onChange={(e) => setDraft((prev) => updateDraftRoot(prev, { subtitle: e.target.value }))}
            />
          </section>

          {cPages.map((page, pageIndex) => {
            const ov = pageLayoutOverflow[pageIndex];
            const snippets = parseCreativeFlowItemHtmlSnippets(String(page.html ?? ''));
            const flowIds = snippets.map((_, i) => `creative-flow-${pageIndex}-${i}`);
            return (
              <section key={pageIndex} className="card p-4 shadow-sm">
                {ov?.vertical || ov?.horizontal ? (
                  <div
                    className="mb-2 rounded-md border border-[var(--color-warn-700)]/30 bg-[var(--color-warn-50)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-warn-700)]"
                    role="alert"
                  >
                    {ov.vertical ? (
                      <span className="block">
                        Überlauf Höhe: ~{Math.max(1, Math.round(ov.px * 0.264))} mm über A4-Inhaltsbereich.
                      </span>
                    ) : null}
                    {ov.horizontal ? <span className="block">Möglicher Überstand in der Breite.</span> : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] pb-3">
                  <span className="badge badge-primary">Seite {pageIndex + 1}</span>
                  <input
                    className="input h-8 min-w-[120px] flex-1 px-2 text-[12px]"
                    placeholder="Seitenzeile (optional)"
                    value={page.page_label ?? ''}
                    onChange={(e) => setPageLabelCreative(pageIndex, e.target.value)}
                    aria-label={`Seitenzeile Seite ${pageIndex + 1}`}
                  />
                  {cPages.length > 1 ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm shrink-0 text-[11px] text-red-700 hover:bg-red-50"
                      onClick={() =>
                        setDraft((prev) => removeDraftPage(prev, pageIndex))
                      }
                    >
                      Seite entfernen
                    </button>
                  ) : null}
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleCreativeFlowDragEnd(pageIndex, snippets)}
                >
                  <SortableContext items={flowIds} strategy={verticalListSortingStrategy}>
                    <ul className="mt-4 list-none space-y-4 pl-0">
                      {snippets.map((snippet, fi) => (
                        <li key={flowIds[fi]}>
                          <SortableCreativeFlowRow
                            id={flowIds[fi]}
                            flowIndex={fi}
                            snippet={snippet}
                            isOpen={expanded[flowIds[fi]] ?? false}
                            onToggle={() => toggle(flowIds[fi])}
                            onCommitRich={(lines) => {
                              if (creativeFlowTeacherRichUnchanged(snippets[fi], lines)) return;
                              const nextSnippet = creativeFlowSnippetSetHostInnerHtmlLines(snippets[fi], lines);
                              if (nextSnippet === snippets[fi]) return;
                              const next = [...snippets];
                              next[fi] = nextSnippet;
                              applyCreativeSnippets(pageIndex, next);
                            }}
                            onRemove={() => {
                              const next = snippets.filter((_, i) => i !== fi);
                              applyCreativeSnippets(pageIndex, next.length > 0 ? next : ['']);
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>

                {onRegenerateWorksheetPage ? (
                  <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)] pt-4">
                    <button
                      type="button"
                      className={cn(
                        'btn btn-sm btn-ki inline-flex items-center gap-1 !h-auto min-h-[30px] whitespace-normal py-1.5 text-center leading-snug',
                        kiPanelOpen[pageIndex] && 'is-open',
                      )}
                      aria-pressed={Boolean(kiPanelOpen[pageIndex])}
                      aria-label={
                        kiPanelOpen[pageIndex]
                          ? `Überarbeitung per KI für Seite ${pageIndex + 1} ausblenden`
                          : `Diese Seite (Seite ${pageIndex + 1}) mit KI per Anweisung überarbeiten`
                      }
                      onClick={() =>
                        setKiPanelOpen((prev) => ({ ...prev, [pageIndex]: !prev[pageIndex] }))
                      }
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Mit KI überarbeiten
                    </button>
                  </div>
                ) : null}
                <WorksheetKiEditPanel
                  pageNumber1Based={pageIndex + 1}
                  open={Boolean(kiPanelOpen[pageIndex])}
                  kiRunning={Boolean(worksheetPageKiUi?.(pageIndex)?.running)}
                  kiQueued={Boolean(worksheetPageKiUi?.(pageIndex)?.queued)}
                  input={kiDraft[pageIndex] ?? ''}
                  onInputChange={(v) => setKiDraft((p) => ({ ...p, [pageIndex]: v }))}
                  messages={kiChatLog[pageIndex] ?? []}
                  onSend={() => handleKiSend(pageIndex)}
                />
              </section>
            );
          })}

        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => setDraft((prev) => appendDraftPage(prev, false))}
        >
          + Neue Seite
        </button>

        <details className="card overflow-hidden">
          <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-semibold text-[var(--color-ink-700)] [&::-webkit-details-marker]:hidden">
            Erweitert · Typografie, Lösungen, Tabellen …
          </summary>
          <div className="max-h-[50vh] overflow-y-auto border-t border-[var(--color-border)] p-3">
            <WorksheetContentEditor content={draft} onChange={(c) => setDraft(() => c)} />
          </div>
        </details>
      </div>
    </Root>
    );
  }

  const handleBlocksDragEnd = (pageIndex: number, blockIds: string[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blockIds.indexOf(String(active.id));
    const newIndex = blockIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setDraft((prev) => reorderDraftBlocksOnPage(prev, pageIndex, oldIndex, newIndex));
  };

  const Root = rootElement;

  return (
    <Root
      id="worksheet-edit-sidebar"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-bg-card)]"
      aria-label="Struktur bearbeiten"
      {...(rootElement === 'div' ? { role: 'complementary' as const } : {})}
    >
      <div className="shrink-0 space-y-2 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--color-ink-900)]">Bearbeitung</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-500)]" title={displayTitle}>
              Inhalt &amp; Reihenfolge
            </p>
          </div>
        </div>
        {err ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800"
            role="alert"
          >
            {err}
          </div>
        ) : null}
        {overflowEntries.length > 0 ? (
          <div
            className="rounded-md border border-[var(--color-warn-700)]/30 bg-[var(--color-warn-50)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-warn-700)]"
            role="status"
            aria-live="polite"
          >
            <span className="block font-semibold">A4-Überlauf erkannt</span>
            <span className="mt-0.5 block text-[10px] font-normal leading-snug">
              {`${overflowEntries
                .map(([idx, v]) => {
                  const n = Number(idx) + 1;
                  const parts: string[] = [];
                  if (v.vertical)
                    parts.push(
                      `Seite ${n}: Inhalt höher als Druckbereich (ca. ${Math.max(1, Math.round(v.px * 0.264))} mm abgeschnitten)`,
                    );
                  if (v.horizontal) parts.push(`Seite ${n}: möglicher Querüberlauf`);
                  return parts.join(' · ');
                })
                .join('; ')}. Bitte kürzen, Zeilen reduzieren oder Inhalt auf die nächste Seite verschieben.`}
            </span>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--color-bg-app)]/40 px-3 py-3">
        <section className="card p-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-500)]">Titel</h3>
          <label htmlFor="ws-edit-title" className="field-label mt-2 text-[12px]">
            Arbeitsblatt-Titel
          </label>
          <input
            id="ws-edit-title"
            className="input"
            value={String(draft.title ?? '')}
            onChange={(e) => setDraft((prev) => updateDraftRoot(prev, { title: e.target.value }))}
          />
          <label htmlFor="ws-edit-sub" className="field-label mt-3 text-[12px]">
            Untertitel
          </label>
          <input
            id="ws-edit-sub"
            className="input"
            value={String(draft.subtitle ?? '')}
            onChange={(e) => setDraft((prev) => updateDraftRoot(prev, { subtitle: e.target.value }))}
          />
        </section>

        {pages.map((page, pageIndex) => {
          const blocks = page.blocks || [];
          const blockIds = blocks.map((b) => String(b.id ?? `p${pageIndex}-fallback`));
          const ik = insertKind[pageIndex] ?? 'text';

          return (
            <section key={pageIndex} className="card p-3">
              {(() => {
                const ov = pageLayoutOverflow[pageIndex];
                if (!ov || (!ov.vertical && !ov.horizontal)) return null;
                return (
                  <div
                    className="mb-2 rounded-md border border-[var(--color-warn-700)]/30 bg-[var(--color-warn-50)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-warn-700)]"
                    role="alert"
                  >
                    {ov.vertical ? (
                      <span className="block">
                        Überlauf Höhe: ~{Math.max(1, Math.round(ov.px * 0.264))} mm über A4-Inhaltsbereich
                        (Vorschau schneidet ab).
                      </span>
                    ) : null}
                    {ov.horizontal ? (
                      <span className="block">Zusätzlich: möglicher Überstand in der Breite — Zeilen prüfen.</span>
                    ) : null}
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] pb-2">
                <span className="badge badge-primary">Seite {pageIndex + 1}</span>
                <input
                  className="input h-8 min-w-[120px] flex-1 px-2 text-[12px]"
                  placeholder="Seitenzeile (optional)"
                  value={page.page_label ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => {
                      const next = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
                      const pg = (next.pages as typeof pages)[pageIndex];
                      if (pg) (next.pages as typeof pages)[pageIndex] = { ...pg, page_label: e.target.value };
                      return next;
                    })
                  }
                  aria-label={`Seitenzeile Seite ${pageIndex + 1}`}
                />
                {pages.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0 text-[11px] text-red-700 hover:bg-red-50"
                    onClick={() => setDraft((prev) => removeDraftPage(prev, pageIndex))}
                  >
                    Seite entfernen
                  </button>
                ) : null}
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBlocksDragEnd(pageIndex, blockIds)}>
                <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                  <ul className="mt-2 space-y-2">
                    {blocks.map((block, blockIndex) => {
                      const id = blockIds[blockIndex];
                      const key = `${pageIndex}-${blockIndex}`;
                      const isOpen = expanded[key];
                      const t = String(block.type || 'text');
                      const summary =
                        String(block.title ?? '').trim().slice(0, 42) ||
                        blockTypeLabel(t).slice(0, 28);

                      return (
                        <li key={id}>
                          <SortableBlockShell
                            id={id}
                            dragHandle={<GripVertical className="h-4 w-4" aria-hidden />}
                            header={
                              <div className="flex min-w-0 items-center gap-1 pr-1">
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-slate-50"
                                  onClick={() => toggle(key)}
                                  aria-expanded={isOpen}
                                >
                                  {isOpen ? (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                  )}
                                  <span className="shrink-0 rounded bg-slate-200/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700">
                                    {t}
                                  </span>
                                  <span className="truncate text-xs font-medium text-slate-800">{summary}</span>
                                </button>
                                <IconButton
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  className="!h-7 !w-7 shrink-0"
                                  aria-label="Block entfernen"
                                  onClick={() =>
                                    setDraft((prev) => removeDraftBlock(prev, pageIndex, blockIndex))
                                  }
                                >
                                  <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                                </IconButton>
                              </div>
                            }
                            panel={
                              isOpen ? (
                                <div className="border-t border-slate-100 px-2 pb-2 pt-2">
                                  <WorksheetBlockFields
                                    block={block}
                                    onChange={(nb) =>
                                      setDraft((prev) => setBlockInDraft(prev, pageIndex, blockIndex, nb))
                                    }
                                  />
                                  {t === 'task_list' && Array.isArray(block.items) ? (
                                    <div className="mt-2 space-y-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-2">
                                      <p className="text-[10px] font-semibold text-slate-600">
                                        Teilaufgaben · Ziehen zum Umsortieren
                                      </p>
                                      <DraggableItemRows
                                        count={block.items.length}
                                        onReorder={(from, to) =>
                                          setDraft((prev) =>
                                            reorderDraftBlockItems(prev, pageIndex, blockIndex, from, to),
                                          )
                                        }
                                        renderRow={(i, drag) => (
                                          <div className="flex items-center gap-1 rounded-md bg-white px-1 py-0.5">
                                            <button
                                              type="button"
                                              className="cursor-grab touch-none text-slate-400"
                                              title="Zeile ziehen"
                                              {...drag}
                                              aria-label="Teilaufgabe verschieben"
                                            >
                                              ⋮⋮
                                            </button>
                                            <span className="text-[10px] text-slate-500">{i + 1}.</span>
                                            <button
                                              type="button"
                                              className="rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-bold text-emerald-900"
                                              onClick={() =>
                                                setDraft((prev) =>
                                                  insertDraftTaskListItem(prev, pageIndex, blockIndex, i + 1),
                                                )
                                              }
                                            >
                                              +
                                            </button>
                                            <button
                                              type="button"
                                              className="rounded border border-red-200 bg-red-50 px-1 text-[10px] font-bold text-red-900"
                                              onClick={() =>
                                                setDraft((prev) =>
                                                  removeDraftTaskListItem(prev, pageIndex, blockIndex, i),
                                                )
                                              }
                                            >
                                              −
                                            </button>
                                          </div>
                                        )}
                                      />
                                    </div>
                                  ) : null}
                                  {t === 'task_grid' && Array.isArray(block.items) ? (
                                    <div className="mt-2 space-y-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-2">
                                      <p className="text-[10px] font-semibold text-slate-600">Rasterzeilen · Ziehen</p>
                                      <DraggableItemRows
                                        count={block.items.length}
                                        onReorder={(from, to) =>
                                          setDraft((prev) =>
                                            reorderDraftBlockItems(prev, pageIndex, blockIndex, from, to),
                                          )
                                        }
                                        renderRow={(i, drag) => (
                                          <div className="flex items-center gap-1 rounded-md bg-white px-1 py-0.5">
                                            <button
                                              type="button"
                                              className="cursor-grab touch-none text-slate-400"
                                              title="Zeile ziehen"
                                              {...drag}
                                              aria-label="Rasterzeile verschieben"
                                            >
                                              ⋮⋮
                                            </button>
                                            <span className="text-[10px] text-slate-500">{i + 1}.</span>
                                            <button
                                              type="button"
                                              className="rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-bold text-emerald-900"
                                              onClick={() =>
                                                setDraft((prev) =>
                                                  insertDraftTaskGridItem(prev, pageIndex, blockIndex, i + 1),
                                                )
                                              }
                                            >
                                              +
                                            </button>
                                            <button
                                              type="button"
                                              className="rounded border border-red-200 bg-red-50 px-1 text-[10px] font-bold text-red-900"
                                              onClick={() =>
                                                setDraft((prev) =>
                                                  removeDraftTaskGridItem(prev, pageIndex, blockIndex, i),
                                                )
                                              }
                                            >
                                              −
                                            </button>
                                          </div>
                                        )}
                                      />
                                    </div>
                                  ) : null}
                                  {t === 'checklist' && Array.isArray(block.items) ? (
                                    <div className="mt-2 space-y-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-2">
                                      <p className="text-[10px] font-semibold text-slate-600">Punkte · Ziehen</p>
                                      <DraggableItemRows
                                        count={block.items.length}
                                        onReorder={(from, to) =>
                                          setDraft((prev) =>
                                            reorderDraftBlockItems(prev, pageIndex, blockIndex, from, to),
                                          )
                                        }
                                        renderRow={(i, drag) => (
                                          <div className="flex items-center gap-1 rounded-md bg-white px-1 py-0.5">
                                            <button
                                              type="button"
                                              className="cursor-grab touch-none text-slate-400"
                                              title="Punkt ziehen"
                                              {...drag}
                                              aria-label="Listenpunkt verschieben"
                                            >
                                              ⋮⋮
                                            </button>
                                            <button
                                              type="button"
                                              className="rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-bold text-emerald-900"
                                              onClick={() =>
                                                setDraft((prev) =>
                                                  insertDraftChecklistItem(prev, pageIndex, blockIndex, i + 1),
                                                )
                                              }
                                            >
                                              +
                                            </button>
                                            <button
                                              type="button"
                                              className="rounded border border-red-200 bg-red-50 px-1 text-[10px] font-bold text-red-900"
                                              onClick={() =>
                                                setDraft((prev) =>
                                                  removeDraftChecklistItem(prev, pageIndex, blockIndex, i),
                                                )
                                              }
                                            >
                                              −
                                            </button>
                                          </div>
                                        )}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              ) : null
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </SortableContext>
              </DndContext>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
                <label className="sr-only" htmlFor={`ins-kind-${pageIndex}`}>
                  Typ für neuen Block
                </label>
                <select
                  id={`ins-kind-${pageIndex}`}
                  className="select h-8 max-w-[12rem] px-2 text-[12px]"
                  value={ik}
                  onChange={(e) =>
                    setInsertKind((prev) => ({ ...prev, [pageIndex]: e.target.value as WorksheetBlockKind }))
                  }
                >
                  {WORKSHEET_BLOCK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setDraft((prev) =>
                      insertDraftBlock(
                        prev,
                        pageIndex,
                        (prev.pages as typeof pages)[pageIndex]?.blocks?.length ?? 0,
                        createDefaultWorksheetBlock(ik),
                      ),
                    )
                  }
                >
                  + Block unten
                </button>
                {onRegenerateWorksheetPage ? (
                  <button
                    type="button"
                    className={cn(
                      'btn btn-sm btn-ki inline-flex items-center gap-1 !h-auto min-h-[30px] whitespace-normal py-1.5 text-center leading-snug',
                      kiPanelOpen[pageIndex] && 'is-open',
                    )}
                    aria-pressed={Boolean(kiPanelOpen[pageIndex])}
                    aria-label={
                      kiPanelOpen[pageIndex]
                        ? `Überarbeitung per KI für Seite ${pageIndex + 1} ausblenden`
                        : `Diese Seite (Seite ${pageIndex + 1}) mit KI per Anweisung überarbeiten`
                    }
                    onClick={() => setKiPanelOpen((prev) => ({ ...prev, [pageIndex]: !prev[pageIndex] }))}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Mit KI überarbeiten
                  </button>
                ) : null}
              </div>
              <WorksheetKiEditPanel
                pageNumber1Based={pageIndex + 1}
                open={Boolean(kiPanelOpen[pageIndex])}
                kiRunning={Boolean(worksheetPageKiUi?.(pageIndex)?.running)}
                kiQueued={Boolean(worksheetPageKiUi?.(pageIndex)?.queued)}
                input={kiDraft[pageIndex] ?? ''}
                onInputChange={(v) => setKiDraft((p) => ({ ...p, [pageIndex]: v }))}
                messages={kiChatLog[pageIndex] ?? []}
                onSend={() => handleKiSend(pageIndex)}
              />
            </section>
          );
        })}

        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => setDraft((prev) => appendDraftPage(prev, true))}
        >
          + Neue Seite
        </button>

        <details className="card overflow-hidden">
          <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-semibold text-[var(--color-ink-700)] [&::-webkit-details-marker]:hidden">
            Erweitert · Typografie, Lösungen, Tabellen …
          </summary>
          <div className="max-h-[50vh] overflow-y-auto border-t border-[var(--color-border)] p-3">
            <WorksheetContentEditor content={draft} onChange={(c) => setDraft(() => c)} />
          </div>
        </details>
      </div>
    </Root>
  );
}
