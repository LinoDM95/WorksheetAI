import { useState, type ReactNode, type SetStateAction } from 'react';
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
import { ChevronDown, ChevronRight, GripVertical, X } from 'lucide-react';
import {
  appendDraftPage,
  createDefaultWorksheetBlock,
  insertDraftBlock,
  insertDraftChecklistItem,
  insertDraftTaskGridItem,
  insertDraftTaskListItem,
  moveDraftBlockBetweenPages,
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
} from '../../lib/contentDraft';
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
    <div ref={setNodeRef} style={style} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-stretch gap-0.5 px-1 py-1">
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
  onRequestRegeneratePage: (pageIndex: number) => void;
  regeneratePageBusyIndex: number | null;
  /** DOM-Messung A4: Seiten mit Inhaltsüberlauf (nur Bearbeiten). */
  pageLayoutOverflow?: Record<number, { vertical: boolean; horizontal: boolean; px: number }>;
  /** Schließt die angedockte Sidebar (z. B. Toolbar / Rand-Tab). */
  onRequestClose?: () => void;
};

export function WorksheetEditSidebar({
  draft,
  setDraft,
  displayTitle,
  err,
  onRequestRegeneratePage,
  regeneratePageBusyIndex,
  pageLayoutOverflow = {},
  onRequestClose,
}: SidebarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const pages = (draft.pages as { page_label?: string; blocks: Record<string, unknown>[] }[]) || [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [insertKind, setInsertKind] = useState<Record<number, WorksheetBlockKind>>({});

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleBlocksDragEnd = (pageIndex: number, blockIds: string[]) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blockIds.indexOf(String(active.id));
    const newIndex = blockIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setDraft((prev) => reorderDraftBlocksOnPage(prev, pageIndex, oldIndex, newIndex));
  };

  const overflowEntries = Object.entries(pageLayoutOverflow).filter(
    ([, v]) => v.vertical || v.horizontal,
  );

  return (
    <aside
      id="worksheet-edit-sidebar"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-bg-card)]"
      aria-label="Struktur bearbeiten"
    >
      <div className="shrink-0 space-y-2 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--color-ink-900)]">Bearbeitung</h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-500)]" title={displayTitle}>
              Inhalt &amp; Reihenfolge
            </p>
          </div>
          {onRequestClose ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon shrink-0"
              onClick={onRequestClose}
              aria-label="Bearbeitungs-Sidebar schließen"
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
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
                <button
                  type="button"
                  disabled={regeneratePageBusyIndex !== null}
                  onClick={() => onRequestRegeneratePage(pageIndex)}
                  title="Diese Seite mit KI neu gestalten"
                  className="btn btn-secondary btn-sm"
                >
                  {regeneratePageBusyIndex === pageIndex ? 'KI …' : 'KI · Seite'}
                </button>
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
                                {pages.length > 1 ? (
                                  <select
                                    className="max-w-[6.5rem] shrink-0 rounded border border-slate-200 bg-white py-0.5 pl-1 pr-1 text-[10px]"
                                    aria-label="Block auf andere Seite verschieben"
                                    defaultValue=""
                                    onChange={(e) => {
                                      const toP = parseInt(e.target.value, 10);
                                      e.currentTarget.value = '';
                                      if (Number.isNaN(toP) || toP === pageIndex) return;
                                      setDraft((prev) =>
                                        moveDraftBlockBetweenPages(
                                          prev,
                                          pageIndex,
                                          blockIndex,
                                          toP,
                                          (prev.pages as typeof pages)[toP]?.blocks?.length ?? 0,
                                        ),
                                      );
                                    }}
                                  >
                                    <option value="" disabled>
                                      → Seite…
                                    </option>
                                    {pages.map((_, pi) =>
                                      pi === pageIndex ? null : (
                                        <option key={pi} value={pi}>
                                          Seite {pi + 1}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                ) : null}
                                <button
                                  type="button"
                                  className="shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 hover:bg-red-100"
                                  onClick={() => {
                                    if (!window.confirm('Diesen Block entfernen?')) return;
                                    setDraft((prev) => removeDraftBlock(prev, pageIndex, blockIndex));
                                  }}
                                >
                                  Löschen
                                </button>
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
              </div>

              {pages.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm mt-2 w-full"
                  onClick={() => {
                    if (!window.confirm(`Seite ${pageIndex + 1} löschen? Inhalt geht verloren.`)) return;
                    setDraft((prev) => removeDraftPage(prev, pageIndex));
                  }}
                >
                  Diese Seite löschen
                </button>
              ) : null}
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
    </aside>
  );
}
