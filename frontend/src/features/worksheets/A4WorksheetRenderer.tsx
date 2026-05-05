import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { Worksheet, PageSetup } from '../../types';
import { LatexText } from '../../components/LatexText';
import { WorksheetDiagramView, normalizeDiagramSpec } from './WorksheetDiagram';
import {
  appendDraftPage,
  applyPlainMathHints,
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
  updateDraftBlock,
  updateDraftBlockItem,
  updateDraftRoot,
  WORKSHEET_BLOCK_OPTIONS,
  type WorksheetBlockKind,
} from '../../lib/contentDraft';

/** Mindestabstand Schreiblinie (Unterkante) bis Fußzeile (Oberkante), px */
const WRITING_LINE_FOOTER_MIN_GAP_PX = 14;

function trimWritingLinesNearFooter(main: HTMLElement | null, footer: HTMLElement | null): void {
  if (!main || !footer) return;
  main.querySelectorAll('.writing-line--footer-trim').forEach((el) => {
    el.classList.remove('writing-line--footer-trim');
  });
  const footerTop = footer.getBoundingClientRect().top;
  let safety = 0;
  while (safety++ < 100) {
    const lines = [...main.querySelectorAll('.writing-line:not(.writing-line--footer-trim)')];
    if (lines.length === 0) break;
    let bottomMost: Element | null = null;
    let maxBottom = -Infinity;
    for (const el of lines) {
      const b = el.getBoundingClientRect().bottom;
      if (b > maxBottom) {
        maxBottom = b;
        bottomMost = el;
      }
    }
    if (!bottomMost) break;
    const lineBottom = bottomMost.getBoundingClientRect().bottom;
    if (footerTop - lineBottom >= WRITING_LINE_FOOTER_MIN_GAP_PX) break;
    bottomMost.classList.add('writing-line--footer-trim');
  }
}

function mm(n: number) {
  return `${n}mm`;
}

type Pres = Record<string, string | undefined> | undefined;

function normToken(scale: string | undefined, fallback: string) {
  const key = (scale || '').toLowerCase();
  const map: Record<string, string> = {
    small: 'sm',
    medium: 'md',
    large: 'lg',
    xlarge: 'xl',
    xs: 'xs',
    sm: 'sm',
    md: 'md',
    lg: 'lg',
    xl: 'xl',
    '2xl': '2xl',
    '3xl': '3xl',
  };
  return map[key] || fallback;
}

const TW: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
};

function typography(pres: Pres) {
  const p = pres || {};
  const bodyK = normToken(p.text_scale as string, 'md');
  const taskK = normToken((p.task_text_scale as string) || bodyK, bodyK);
  const headK = normToken(p.heading_scale as string, '2xl');
  const leading =
    p.line_height === 'tight'
      ? 'leading-tight'
      : p.line_height === 'relaxed'
        ? 'leading-relaxed'
        : 'leading-normal';
  const gap =
    p.density === 'dense' ? 'space-y-2' : p.density === 'sparse' ? 'space-y-5' : 'space-y-4';
  const taskListGap = p.density === 'dense' ? 'gap-1.5' : p.density === 'sparse' ? 'gap-2.5' : 'gap-2';
  const betweenNumberedTasks =
    p.density === 'dense' ? 'space-y-1' : p.density === 'sparse' ? 'space-y-2' : 'space-y-1.5';
  return {
    body: `${TW[bodyK] || 'text-base'} ${leading} text-slate-900`,
    task: `${TW[taskK] || 'text-base'} ${leading} text-slate-900`,
    heading: `${TW[headK] || 'text-2xl'} font-semibold leading-tight text-slate-900`,
    sectionTitle: `${TW[normToken(taskK, 'lg')] || 'text-base'} font-semibold text-slate-900`,
    gap,
    taskListGap,
    betweenNumberedTasks,
    register: p.register || '',
  };
}

function tableColumns(block: any) {
  if (Array.isArray(block.columns) && block.columns.length) return block.columns;
  const headers = block.headers;
  if (!Array.isArray(headers)) return [];
  return headers.map((h: any, i: number) =>
    typeof h === 'object' && h?.key ? h : { key: `c${i}`, label: String(h) }
  );
}

function clampTableRowHeightMm(raw: unknown): number | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 8) return null;
  return Math.min(80, Math.max(8, Math.round(n * 2) / 2));
}

function TableCellMinHeight({ rowMm, children }: { rowMm: number | null; children: ReactNode }) {
  if (rowMm == null) return <>{children}</>;
  return (
    <div className="worksheet-table-cell-inner" style={{ minHeight: `${rowMm}mm` }}>
      {children}
    </div>
  );
}

export const DEFAULT_TASK_LIST_ANSWER_LINES = 6;
export const CAP_WRITING_LINES = 48;

const countTaskListAnswerLines = (it: { answer_lines?: unknown }): number => {
  const v = it.answer_lines;
  if (v === 0) return 0;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return Math.min(CAP_WRITING_LINES, Math.floor(v));
  }
  return DEFAULT_TASK_LIST_ANSWER_LINES;
};

/** Live-Bearbeitung auf dem Blatt → patcht dasselbe JSON wie der Formular-Editor */
export type ContentDraftEdit = {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
};

function draftBlockOr(
  edit: ContentDraftEdit | undefined,
  pageIndex: number,
  blockIndex: number,
  fallback: Record<string, any>,
): Record<string, any> {
  if (!edit) return fallback;
  const pages = edit.draft.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  const b = pages?.[pageIndex]?.blocks?.[blockIndex];
  return b && typeof b === 'object' ? { ...fallback, ...(b as Record<string, any>) } : fallback;
}

const sheetInlineEditChrome =
  'box-border border-0 bg-indigo-50/40 p-0 m-0 outline outline-1 -outline-offset-1 outline-dashed outline-indigo-400/75 rounded-sm shadow-none ring-0 print:hidden transition-[outline-color] focus:bg-white/90 focus:outline-solid focus-visible:outline-indigo-600';

function SheetInlineText({
  className,
  value,
  onChange,
  mathHintsOnBlur,
}: {
  className: string;
  value: string;
  onChange: (v: string) => void;
  mathHintsOnBlur?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={taRef}
      spellCheck
      rows={1}
      className={`block w-full min-h-0 cursor-text resize-none overflow-hidden ${sheetInlineEditChrome} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        if (!mathHintsOnBlur) return;
        const h = applyPlainMathHints(value);
        if (h !== value) onChange(h);
      }}
    />
  );
}

function SheetInlineTitle({
  className,
  value,
  onChange,
}: {
  className: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      spellCheck
      className={`box-border ${sheetInlineEditChrome} w-full cursor-text ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function EditableBlockSection({
  editCtx,
  pageIndex,
  blockIndex,
  sectionClassName,
  children,
}: {
  editCtx?: ContentDraftEdit;
  pageIndex: number;
  blockIndex: number;
  /** z. B. flex-1 für Zeichenfeld bis zum unteren Seitenrand */
  sectionClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`${editCtx ? 'worksheet-block relative' : 'worksheet-block'}${sectionClassName ? ` ${sectionClassName}` : ''}`}
    >
      {editCtx ? (
        <InlineBlockToolbar pageIndex={pageIndex} blockIndex={blockIndex} editCtx={editCtx} />
      ) : null}
      {children}
    </section>
  );
}

function InlineBlockToolbar({
  pageIndex,
  blockIndex,
  editCtx,
}: {
  pageIndex: number;
  blockIndex: number;
  editCtx: ContentDraftEdit;
}) {
  const [kind, setKind] = useState<WorksheetBlockKind>('text');

  const handleInsert = (where: 'before' | 'after') => {
    const nb = createDefaultWorksheetBlock(kind);
    const at = where === 'before' ? blockIndex : blockIndex + 1;
    editCtx.setDraft((prev) => insertDraftBlock(prev as Record<string, unknown>, pageIndex, at, nb));
  };

  const handleRemove = () => {
    if (!window.confirm('Diesen Block wirklich entfernen?')) return;
    editCtx.setDraft((prev) => removeDraftBlock(prev as Record<string, unknown>, pageIndex, blockIndex));
  };

  return (
    <div
      className="no-print pointer-events-none absolute right-0 top-0 z-[55] flex max-w-[calc(100%-2px)] justify-end"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-end gap-1 rounded-md border border-slate-200/90 bg-white/95 px-1.5 py-1 text-[10px] shadow-sm">
        <label className="sr-only" htmlFor={`blk-kind-${pageIndex}-${blockIndex}`}>
          Blocktyp zum Einfügen
        </label>
        <select
          id={`blk-kind-${pageIndex}-${blockIndex}`}
          className="max-w-[10rem] shrink rounded border border-slate-200 bg-white py-0.5 pl-1 pr-6 text-[10px] text-slate-800"
          value={kind}
          onChange={(e) => setKind(e.target.value as WorksheetBlockKind)}
        >
          {WORKSHEET_BLOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="Gewählten Typ oberhalb dieses Blocks einfügen"
          className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-medium text-slate-700 hover:bg-slate-100"
          onClick={() => handleInsert('before')}
        >
          Darüber
        </button>
        <button
          type="button"
          title="Gewählten Typ unterhalb dieses Blocks einfügen"
          className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-medium text-slate-700 hover:bg-slate-100"
          onClick={() => handleInsert('after')}
        >
          Darunter
        </button>
        <button
          type="button"
          title="Ganzen Block löschen"
          className="rounded border border-red-200 bg-red-50 px-1 py-0.5 font-semibold text-red-800 hover:bg-red-100"
          onClick={handleRemove}
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

function PageEndEditStrip({
  pageIndex,
  totalPages,
  editCtx,
}: {
  pageIndex: number;
  totalPages: number;
  editCtx: ContentDraftEdit;
}) {
  const handleAppendBlockEnd = () => {
    editCtx.setDraft((prev) => {
      const pages = (prev.pages as { blocks?: Record<string, unknown>[] }[]) || [];
      const pg = pages[pageIndex];
      const at = (pg?.blocks || []).length;
      const nb = createDefaultWorksheetBlock('text');
      return insertDraftBlock(prev as Record<string, unknown>, pageIndex, at, nb);
    });
  };

  const handleNewPage = () => {
    editCtx.setDraft((prev) => appendDraftPage(prev as Record<string, unknown>, true));
  };

  const handleRemovePage = () => {
    if (totalPages <= 1) return;
    if (!window.confirm(`Seite ${pageIndex + 1} wirklich aus dem Dokument entfernen? Inhalt dieser Seite geht verloren.`))
      return;
    editCtx.setDraft((prev) => removeDraftPage(prev as Record<string, unknown>, pageIndex));
  };

  return (
    <div className="no-print mt-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-slate-300/90 pt-2 text-[11px] text-slate-600">
      <span className="font-semibold text-slate-800">Struktur (Seite {pageIndex + 1})</span>
      <button
        type="button"
        className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50"
        onClick={handleAppendBlockEnd}
      >
        + Block unten auf dieser Seite
      </button>
      <button
        type="button"
        className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 font-medium text-indigo-900 hover:bg-indigo-100"
        onClick={handleNewPage}
      >
        + Neue Seite
      </button>
      {totalPages > 1 ? (
        <button
          type="button"
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-900 hover:bg-red-100"
          onClick={handleRemovePage}
        >
          Seite löschen
        </button>
      ) : null}
    </div>
  );
}

function Block({
  block,
  ty,
  pageIndex,
  blockIndex,
  totalBlocksOnPage,
  isLandscape,
  editCtx,
}: {
  block: any;
  ty: ReturnType<typeof typography>;
  pageIndex: number;
  blockIndex: number;
  totalBlocksOnPage: number;
  isLandscape: boolean;
  editCtx?: ContentDraftEdit;
}) {
  const d = draftBlockOr(editCtx, pageIndex, blockIndex, block as Record<string, any>);
  const patch = (p: Record<string, unknown>) => {
    if (!editCtx) return;
    editCtx.setDraft((prev) => updateDraftBlock(prev as Record<string, unknown>, pageIndex, blockIndex, p));
  };
  const edit = !!editCtx;

  if (block.type === 'task_grid')
    return (
      <EditableBlockSection editCtx={editCtx} pageIndex={pageIndex} blockIndex={blockIndex}>
        <h3 className={`mb-2 ${ty.sectionTitle}`}>
          {edit ? (
            <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? '')} onChange={(v) => patch({ title: v })} />
          ) : (
            <LatexText text={block.title} />
          )}
        </h3>
        <div className={`flex flex-col ${ty.taskListGap}`}>
          {block.items?.map((it: any, idx: number) => {
            const di = (Array.isArray(d.items) ? d.items[idx] : null) as Record<string, unknown> | null;
            const label = String(di?.label ?? it.label ?? '');
            const text = String(di?.text ?? it.text ?? '');
            const itemPatch = (ip: Record<string, unknown>) => {
              if (!editCtx) return;
              editCtx.setDraft((prev) =>
                updateDraftBlockItem(prev as Record<string, unknown>, pageIndex, blockIndex, idx, ip),
              );
            };
            return (
              <div
                key={`${it.label ?? 't'}-${idx}`}
                className={`${ty.task} relative flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-14`}
              >
                {edit ? (
                  <input
                    className={`${ty.task} ${sheetInlineEditChrome} w-12 shrink-0 tabular-nums text-center`}
                    value={label}
                    onChange={(e) => itemPatch({ label: e.target.value })}
                    aria-label={`Label Aufgabe ${idx + 1}`}
                  />
                ) : (
                  <span className="tabular-nums text-slate-600 shrink-0">{it.label})</span>
                )}
                <span className="min-w-0 flex-1">
                  {edit ? (
                    <SheetInlineText className={ty.task} value={text} onChange={(v) => itemPatch({ text: v })} mathHintsOnBlur />
                  ) : (
                    <LatexText text={it.text} as="span" />
                  )}
                </span>
                <span className="answer-box shrink-0 border-slate-400"></span>
                {edit && editCtx ? (
                  <span
                    className="no-print pointer-events-none absolute right-0 top-0 z-10 flex gap-0.5"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label={`Neue Rasterzeile unter Zeile ${idx + 1}`}
                      title="Zeile darunter einfügen"
                      className="pointer-events-auto h-6 min-w-[1.375rem] rounded border border-emerald-200 bg-emerald-50 px-0.5 text-[11px] font-bold leading-none text-emerald-900 hover:bg-emerald-100"
                      onClick={() =>
                        editCtx.setDraft((prev) =>
                          insertDraftTaskGridItem(prev as Record<string, unknown>, pageIndex, blockIndex, idx + 1),
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label={`Rasterzeile ${idx + 1} entfernen`}
                      title="Diese Zeile entfernen"
                      className="pointer-events-auto h-6 min-w-[1.375rem] rounded border border-red-200 bg-red-50 px-0.5 text-[11px] font-bold leading-none text-red-900 hover:bg-red-100"
                      onClick={() =>
                        editCtx.setDraft((prev) =>
                          removeDraftTaskGridItem(prev as Record<string, unknown>, pageIndex, blockIndex, idx),
                        )
                      }
                    >
                      −
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </EditableBlockSection>
    );

  if (block.type === 'table') {
    const cols = tableColumns(block);
    const rowHm =
      clampTableRowHeightMm(d.row_height_mm) ?? clampTableRowHeightMm(block.row_height_mm);
    return (
      <EditableBlockSection editCtx={editCtx} pageIndex={pageIndex} blockIndex={blockIndex}>
        <h3 className={`mb-2 ${ty.sectionTitle}`}>
          {edit ? (
            <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? '')} onChange={(v) => patch({ title: v })} />
          ) : (
            <LatexText text={block.title} />
          )}
        </h3>
        <table className={`worksheet-table ${ty.body}`}>
          <thead>
            <tr>
              {cols.map((c: any) => (
                <th key={c.key} className="align-top">
                  <TableCellMinHeight rowMm={rowHm}>
                    <LatexText text={c.label} />
                  </TableCellMinHeight>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows?.map((r: any, i: number) => (
              <tr key={i}>
                {cols.map((c: any) => (
                  <td key={c.key} className="align-top">
                    <TableCellMinHeight rowMm={rowHm}>
                      <LatexText text={r[c.key]} />
                    </TableCellMinHeight>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </EditableBlockSection>
    );
  }

  if (block.type === 'diagram') {
    const specRaw = d.spec ?? block.spec;
    const normalized = normalizeDiagramSpec(specRaw);
    return (
      <EditableBlockSection editCtx={editCtx} pageIndex={pageIndex} blockIndex={blockIndex}>
        {(block.figure_label || d.figure_label) && String(block.figure_label || d.figure_label).trim() ? (
          <p className={`mb-1 text-xs font-medium text-slate-600 ${ty.body}`}>
            {edit ? (
              <input
                className={`w-full rounded border border-dashed border-indigo-400/80 bg-indigo-50/50 px-1 py-0.5 font-mono text-xs outline-none print:hidden`}
                value={String(d.figure_label ?? block.figure_label ?? '')}
                onChange={(e) => patch({ figure_label: e.target.value })}
                aria-label="Abbildungslabel"
              />
            ) : (
              String(block.figure_label || d.figure_label)
            )}
          </p>
        ) : null}
        <h3 className={`mb-1 ${ty.sectionTitle}`}>
          {edit ? (
            <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? '')} onChange={(v) => patch({ title: v })} />
          ) : (
            <LatexText text={block.title} />
          )}
        </h3>
        <div className={`${ty.body} mb-2`}>
          {edit ? (
            <SheetInlineText
              className={ty.body}
              value={String(d.instruction ?? block.instruction ?? '')}
              onChange={(v) => patch({ instruction: v })}
            />
          ) : block.instruction || d.instruction ? (
            <LatexText text={String(block.instruction || d.instruction)} as="span" />
          ) : null}
        </div>
        <div className="flex justify-center rounded border border-slate-300 bg-white px-2 py-3">
          {normalized ? (
            <WorksheetDiagramView spec={normalized} />
          ) : (
            <p className={`text-center text-sm text-amber-800 ${ty.body}`}>Ungültiges oder fehlendes diagram.spec — bitte im Editor korrigieren.</p>
          )}
        </div>
      </EditableBlockSection>
    );
  }

  if (block.type === 'drawing_box') {
    const hmRaw = d.height_mm ?? block.height_mm;
    let heightMm = 48;
    if (typeof hmRaw === 'number' && Number.isFinite(hmRaw)) {
      heightMm = Math.min(190, Math.max(25, Math.round(hmRaw)));
    } else if (typeof hmRaw === 'string' && hmRaw.trim() !== '') {
      const n = Number(hmRaw);
      if (Number.isFinite(n)) heightMm = Math.min(190, Math.max(25, Math.round(n)));
    }
    const expandRaw = d.expand_to_page_bottom ?? block.expand_to_page_bottom;
    const expandToBottom =
      !isLandscape &&
      blockIndex === totalBlocksOnPage - 1 &&
      (expandRaw === true || expandRaw === 'true');
    const sectionGrow = expandToBottom ? 'flex min-h-0 flex-1 flex-col' : '';
    return (
      <EditableBlockSection
        editCtx={editCtx}
        pageIndex={pageIndex}
        blockIndex={blockIndex}
        sectionClassName={sectionGrow || undefined}
      >
        <h3 className={`shrink-0 mb-1 ${ty.sectionTitle}`}>
          {edit ? (
            <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? '')} onChange={(v) => patch({ title: v })} />
          ) : (
            <LatexText text={block.title} />
          )}
        </h3>
        <div className={`${ty.body} mb-2 shrink-0`}>
          {edit ? (
            <SheetInlineText
              className={ty.body}
              value={String(d.instruction ?? '')}
              onChange={(v) => patch({ instruction: v })}
            />
          ) : (
            <LatexText text={block.instruction} as="span" />
          )}
        </div>
        <div
          className={`border border-dashed border-slate-400 bg-white ${expandToBottom ? 'min-h-0 flex-1' : ''}`}
          style={{ minHeight: mm(heightMm) }}
          aria-hidden
        />
      </EditableBlockSection>
    );
  }

  if (block.type === 'checklist')
    return (
      <EditableBlockSection editCtx={editCtx} pageIndex={pageIndex} blockIndex={blockIndex}>
        <h3 className={`mb-2 ${ty.sectionTitle}`}>
          {edit ? (
            <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? '')} onChange={(v) => patch({ title: v })} />
          ) : (
            <LatexText text={block.title} />
          )}
        </h3>
        {block.items?.map((it: any, i: number) => {
          const raw = (typeof it === 'object' && it?.text) || it;
          const di = (Array.isArray(d.items) ? d.items[i] : null) as Record<string, unknown> | { text?: string } | string | null;
          const textVal =
            typeof di === 'object' && di && 'text' in di
              ? String((di as { text?: string }).text ?? '')
              : typeof di === 'string'
                ? di
                : String(raw ?? '');
          const itemPatch = (ip: Record<string, unknown>) => {
            if (!editCtx) return;
            editCtx.setDraft((prev) =>
              updateDraftBlockItem(prev as Record<string, unknown>, pageIndex, blockIndex, i, ip),
            );
          };
          return (
            <label key={i} className={`flex gap-3 py-0.5 ${ty.body}`}>
              <span className="mt-0.5 h-4 w-4 shrink-0 border border-slate-700 bg-white" aria-hidden></span>
              {edit ? (
                <SheetInlineText className={`min-w-0 flex-1 ${ty.body}`} value={textVal} onChange={(v) => itemPatch({ text: v })} />
              ) : (
                <LatexText text={raw} as="span" />
              )}
              {edit && editCtx ? (
                <span className="ml-auto flex shrink-0 gap-0.5 self-start pt-0.5" onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    aria-label={`Listenpunkt unter Position ${i + 1}`}
                    title="Punkt darunter einfügen"
                    className="rounded border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[10px] font-bold text-emerald-900 hover:bg-emerald-100"
                    onClick={() =>
                      editCtx.setDraft((prev) =>
                        insertDraftChecklistItem(prev as Record<string, unknown>, pageIndex, blockIndex, i + 1),
                      )
                    }
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`Listenpunkt ${i + 1} löschen`}
                    title="Punkt entfernen"
                    className="rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] font-bold text-red-900 hover:bg-red-100"
                    onClick={() =>
                      editCtx.setDraft((prev) =>
                        removeDraftChecklistItem(prev as Record<string, unknown>, pageIndex, blockIndex, i),
                      )
                    }
                  >
                    −
                  </button>
                </span>
              ) : null}
            </label>
          );
        })}
      </EditableBlockSection>
    );

  if (block.type === 'writing_lines') {
    const raw = d.lines ?? block.lines;
    let n: number;
    if (raw == null || raw === '') n = 10;
    else {
      const num = Number(raw);
      n = Number.isFinite(num) && num >= 0 ? Math.min(CAP_WRITING_LINES, Math.floor(num)) : 10;
    }
    return (
      <EditableBlockSection editCtx={editCtx} pageIndex={pageIndex} blockIndex={blockIndex}>
        <h3 className={`mb-2 ${ty.sectionTitle}`}>
          {edit ? (
            <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? '')} onChange={(v) => patch({ title: v })} />
          ) : (
            <LatexText text={block.title} />
          )}
        </h3>
        {n > 0 ? Array.from({ length: n }).map((_, i) => <div className="writing-line" key={i} />) : null}
      </EditableBlockSection>
    );
  }

  if (block.type === 'task_list')
    return (
      <EditableBlockSection editCtx={editCtx} pageIndex={pageIndex} blockIndex={blockIndex}>
        <h3 className={`mb-2 ${ty.sectionTitle}`}>
          {edit ? (
            <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? '')} onChange={(v) => patch({ title: v })} />
          ) : (
            <LatexText text={block.title} />
          )}
        </h3>
        <ol className={`list-decimal pl-6 ${ty.betweenNumberedTasks}`}>
          {block.items?.map((it: any, i: number) => {
            const di = (Array.isArray(d.items) ? d.items[i] : null) as Record<string, unknown> | null;
            const text = String(di?.text ?? it.text ?? it ?? '');
            const lineCount = countTaskListAnswerLines({ ...(it as object), ...(di || {}) } as { answer_lines?: unknown });
            const itemPatch = (ip: Record<string, unknown>) => {
              if (!editCtx) return;
              editCtx.setDraft((prev) =>
                updateDraftBlockItem(prev as Record<string, unknown>, pageIndex, blockIndex, i, ip),
              );
            };
            return (
              <li key={i} className={`relative ${ty.body}`}>
                {edit && editCtx ? (
                  <span
                    className="no-print pointer-events-none absolute right-0 top-0 z-10 flex gap-0.5"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label={`Neue Teilaufgabe unter Nummer ${i + 1}`}
                      title="Teilaufgabe darunter einfügen"
                      className="pointer-events-auto h-6 min-w-[1.375rem] rounded border border-emerald-200 bg-emerald-50 px-0.5 text-[11px] font-bold leading-none text-emerald-900 hover:bg-emerald-100"
                      onClick={() =>
                        editCtx.setDraft((prev) =>
                          insertDraftTaskListItem(prev as Record<string, unknown>, pageIndex, blockIndex, i + 1),
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label={`Teilaufgabe ${i + 1} löschen`}
                      title="Teilaufgabe entfernen"
                      className="pointer-events-auto h-6 min-w-[1.375rem] rounded border border-red-200 bg-red-50 px-0.5 text-[11px] font-bold leading-none text-red-900 hover:bg-red-100"
                      onClick={() =>
                        editCtx.setDraft((prev) =>
                          removeDraftTaskListItem(prev as Record<string, unknown>, pageIndex, blockIndex, i),
                        )
                      }
                    >
                      −
                    </button>
                  </span>
                ) : null}
                {edit ? (
                  <SheetInlineText className={`${ty.task} pr-16`} value={text} onChange={(v) => itemPatch({ text: v })} mathHintsOnBlur />
                ) : (
                  <LatexText text={it.text || it} as="span" />
                )}
                {lineCount > 0 ? (
                  <div className="mt-2 w-full space-y-0" aria-label="Schreibfläche">
                    {Array.from({ length: lineCount }).map((_, j) => (
                      <div className="writing-line" key={j} />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </EditableBlockSection>
    );

  /* text + default */
  const contentStr = String(d.content ?? block.content ?? '');
  const linesVal = d.lines != null && d.lines !== '' ? Number(d.lines) : block.lines || 0;

  return (
    <EditableBlockSection editCtx={editCtx} pageIndex={pageIndex} blockIndex={blockIndex}>
      <h3 className={`mb-2 ${ty.sectionTitle}`}>
        {edit ? (
          <SheetInlineTitle className={ty.sectionTitle} value={String(d.title ?? block.title ?? '')} onChange={(v) => patch({ title: v })} />
        ) : (
          <LatexText text={block.title} />
        )}
      </h3>
      {edit ? (
        <SheetInlineText className={ty.body} value={contentStr} onChange={(v) => patch({ content: v })} mathHintsOnBlur />
      ) : (
        <p className={ty.body}>
          <LatexText text={block.content} as="span" />
        </p>
      )}
      {Array.from({ length: linesVal || 0 }).map((_, i) => (
        <div className="writing-line" key={i} />
      ))}
    </EditableBlockSection>
  );
}

function PageAiWandButton({
  pageIndex,
  busy,
  onClick,
}: {
  pageIndex: number;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title="Diese Seite mit KI neu gestalten"
      aria-label={`Seite ${pageIndex + 1} mit KI neu gestalten`}
      className="no-print pointer-events-auto absolute right-1 top-1 z-[60] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-300 bg-violet-50 text-violet-700 shadow-md transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-5 w-5"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
      </svg>
    </button>
  );
}

/** Layout-Messung (Bearbeitungsmodus): Inhalt ragt aus dem A4-Hauptbereich (overflow hidden). */
export type PageLayoutOverflowInfo = {
  pageIndex: number;
  overflowsVertical: boolean;
  overflowsHorizontal: boolean;
  /** Geschätzter vertikaler Überstand in CSS-Pixeln (nur wenn overflowsVertical). */
  overflowPxVertical: number;
};

function A4PageShell({
  page,
  pageIndex,
  totalPages,
  rm,
  worksheet,
  ty,
  showGuide,
  editCtx,
  onRequestRegeneratePage,
  regeneratePageBusyIndex,
  onPageLayoutOverflow,
}: {
  page: { page_label?: string; blocks: any[] };
  pageIndex: number;
  totalPages: number;
  rm: any;
  worksheet: Worksheet;
  ty: ReturnType<typeof typography>;
  showGuide: boolean;
  editCtx?: ContentDraftEdit;
  onRequestRegeneratePage?: (pageIndex: number) => void;
  regeneratePageBusyIndex?: number | null;
  onPageLayoutOverflow?: (info: PageLayoutOverflowInfo) => void;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const pageBodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const pageSetup = rm.page_setup || worksheet.page_setup;
  const isLandscape = pageSetup.orientation === 'landscape';
  const footerPageLabel =
    (page.page_label || '').trim() || `Seite ${pageIndex + 1} von ${totalPages}`;
  const footerLeft = (rm.title || worksheet.title || '').trim();

  const metaTitle = String(editCtx?.draft.title ?? rm.title ?? worksheet.title ?? '');
  const metaSubtitle = String(
    (editCtx?.draft as { subtitle?: string })?.subtitle ?? rm.subtitle ?? worksheet.subject ?? '',
  );

  const layoutFingerprint = useMemo(
    () =>
      JSON.stringify({
        i: pageIndex,
        blocks: (page.blocks || []).map((b: any) => ({
          id: b.id,
          t: b.type,
          lines: b.lines,
          il: Array.isArray(b.items) ? b.items.length : 0,
          dh: b.type === 'drawing_box' ? b.height_mm : undefined,
          dex: b.type === 'drawing_box' ? b.expand_to_page_bottom : undefined,
        })),
        edit: !!editCtx,
      }),
    [page.blocks, pageIndex, editCtx],
  );

  const overflowEffectKey = useMemo(() => {
    if (!onPageLayoutOverflow) return '';
    return JSON.stringify({
      i: pageIndex,
      blocks: (page.blocks || []).map((b: any) => ({
        id: b.id,
        t: b.type,
        lines: b.lines,
        il: Array.isArray(b.items) ? b.items.length : 0,
        dh: b.type === 'drawing_box' ? b.height_mm : undefined,
        dex: b.type === 'drawing_box' ? b.expand_to_page_bottom : undefined,
      })),
      edit: !!editCtx,
      metaTitle,
      metaSubtitle,
      footerPageLabel,
      footerLeft,
      pageLabel: (page.page_label || '').trim(),
      textScale: String((rm.presentation?.text_scale as string) || 'md'),
      worksheetSubject: String(worksheet.subject ?? ''),
    });
  }, [
    onPageLayoutOverflow,
    pageIndex,
    page.blocks,
    editCtx,
    metaTitle,
    metaSubtitle,
    footerPageLabel,
    footerLeft,
    page.page_label,
    rm.presentation?.text_scale,
    worksheet.subject,
  ]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const footer = footerRef.current;
    if (!main || !footer) return;

    const run = () => trimWritingLinesNearFooter(main, footer);

    run();
    const raf = requestAnimationFrame(run);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null;
    ro?.observe(main);
    ro?.observe(footer);

    const onBeforePrint = () => run();
    window.addEventListener('beforeprint', onBeforePrint);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [layoutFingerprint, footerPageLabel, footerLeft, showGuide]);

  const overflowCallbackRef = useRef(onPageLayoutOverflow);
  overflowCallbackRef.current = onPageLayoutOverflow;
  const lastEmittedOverflowRef = useRef<{ v: boolean; h: boolean; px: number } | null>(null);

  useLayoutEffect(() => {
    if (!onPageLayoutOverflow || overflowEffectKey === '') return;
    const main = mainRef.current;
    if (!main) return;

    lastEmittedOverflowRef.current = null;
    const TOL = 2;
    let raf0 = 0;
    const measure = () => {
      cancelAnimationFrame(raf0);
      raf0 = requestAnimationFrame(() => {
        const cb = overflowCallbackRef.current;
        if (!cb) return;
        const v = main.scrollHeight > main.clientHeight + TOL;
        const h = main.scrollWidth > main.clientWidth + TOL;
        const px = Math.max(0, main.scrollHeight - main.clientHeight);
        const pxR = Math.round(px);
        const prev = lastEmittedOverflowRef.current;
        if (prev && prev.v === v && prev.h === h && Math.abs(prev.px - pxR) <= 1) return;
        lastEmittedOverflowRef.current = { v, h, px: pxR };
        cb({
          pageIndex,
          overflowsVertical: v,
          overflowsHorizontal: h,
          overflowPxVertical: px,
        });
      });
    };

    measure();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            measure();
          })
        : null;
    ro?.observe(main);
    const body = pageBodyRef.current;
    if (body) ro?.observe(body);

    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => measure());
      mo.observe(main, { subtree: true, childList: true, characterData: true, attributes: false });
    }

    const fontsP = document.fonts?.ready;
    if (fontsP && typeof fontsP.then === 'function') void fontsP.then(measure);

    return () => {
      cancelAnimationFrame(raf0);
      ro?.disconnect();
      mo?.disconnect();
      lastEmittedOverflowRef.current = null;
    };
  }, [onPageLayoutOverflow, overflowEffectKey, pageIndex]);

  return (
    <div
      className="a4-page"
      data-a4-page-index={pageIndex}
      data-a4-page-count={totalPages}
      style={{
        width: mm(pageSetup.width_mm),
        boxSizing: 'border-box',
        ['--a4-page-height' as string]: mm(pageSetup.height_mm),
        ['--page-margin-bottom' as string]: mm(pageSetup.margins_mm.bottom),
        ['--page-margin-left' as string]: mm(pageSetup.margins_mm.left),
        ['--page-margin-right' as string]: mm(pageSetup.margins_mm.right),
      }}
    >
      {editCtx && onRequestRegeneratePage ? (
        <PageAiWandButton
          pageIndex={pageIndex}
          busy={regeneratePageBusyIndex === pageIndex}
          onClick={() => onRequestRegeneratePage(pageIndex)}
        />
      ) : null}
      <main
        ref={mainRef}
        className="page-content worksheet-page-frame flex min-h-0 h-full min-w-0 flex-col overflow-hidden"
        style={{
          paddingTop: mm(pageSetup.margins_mm.top),
          paddingRight: mm(pageSetup.margins_mm.right),
          paddingBottom: '0.75rem',
          paddingLeft: mm(pageSetup.margins_mm.left),
          boxSizing: 'border-box',
        }}
      >
        <header className="mb-5 shrink-0 border-b border-slate-900 pb-3">
          {editCtx && pageIndex === 0 ? (
            <>
              <SheetInlineTitle
                className={ty.heading}
                value={metaTitle}
                onChange={(v) => editCtx.setDraft((prev) => updateDraftRoot(prev as Record<string, unknown>, { title: v }))}
              />
              <SheetInlineText
                className={`mt-1 text-slate-700 ${TW[normToken((rm.presentation?.text_scale as string) || 'md', 'md')] || 'text-base'}`}
                value={metaSubtitle}
                onChange={(v) =>
                  editCtx.setDraft((prev) => updateDraftRoot(prev as Record<string, unknown>, { subtitle: v }))
                }
              />
            </>
          ) : (
            <>
              <h1 className={ty.heading}>
                <LatexText text={rm.title || worksheet.title} />
              </h1>
              {rm.subtitle || worksheet.subject ? (
                <p
                  className={`mt-1 text-slate-700 ${
                    TW[normToken((rm.presentation?.text_scale as string) || 'md', 'md')] || 'text-base'
                  }`}
                >
                  <LatexText text={rm.subtitle || worksheet.subject} as="span" />
                </p>
              ) : null}
            </>
          )}
    </header>
        <div ref={pageBodyRef} className="worksheet-page-body min-h-0 flex flex-1 flex-col">
          <div
            className={
              isLandscape
                ? 'grid min-h-0 flex-1 grid-cols-2 gap-x-6 gap-y-0'
                : `${ty.gap} flex min-h-0 flex-1 flex-col print:flex print:min-h-0 print:flex-1 print:flex-col`
            }
          >
            {(() => {
              const n = page.blocks?.length ?? 0;
              return page.blocks?.map((b: any, bi: number) => (
                <Block
                  block={b}
                  ty={ty}
                  pageIndex={pageIndex}
                  blockIndex={bi}
                  totalBlocksOnPage={n}
                  isLandscape={isLandscape}
                  editCtx={editCtx}
                  key={b.id || `p-${pageIndex}-b-${bi}`}
                />
              ));
            })()}
          </div>
        </div>
        {editCtx ? <PageEndEditStrip pageIndex={pageIndex} totalPages={totalPages} editCtx={editCtx} /> : null}
   </main>
      <footer
        ref={footerRef}
        className="worksheet-page-footer border-t border-slate-300 pt-2"
        role="contentinfo"
      >
        <div className="flex items-end justify-between gap-4 text-xs text-slate-600">
          <span className="min-w-0 flex-1 leading-snug">
            {footerLeft ? (
              <span className="line-clamp-2" title={footerLeft}>
                {footerLeft}
                {worksheet.subject ? ` · ${worksheet.subject}` : ''}
              </span>
            ) : worksheet.subject ? (
              <span>{worksheet.subject}</span>
            ) : (
              <span className="text-slate-400">Arbeitsblatt</span>
            )}
          </span>
          <span className="shrink-0 tabular-nums text-slate-700">{footerPageLabel}</span>
        </div>
      </footer>
      {showGuide ? (
        <div
          className="margin-guide"
          style={{
            top: mm(pageSetup.margins_mm.top),
            right: mm(pageSetup.margins_mm.right),
            bottom: mm(pageSetup.margins_mm.bottom),
            left: mm(pageSetup.margins_mm.left),
          }}
        />
      ) : null}
    </div>
  );
}

type RendererProps = {
  worksheet: Worksheet;
  showGuide?: boolean;
  contentDraft?: Record<string, unknown> | null;
  onContentDraftChange?: Dispatch<SetStateAction<Record<string, unknown>>>;
  onRequestRegeneratePage?: (pageIndex: number) => void;
  regeneratePageBusyIndex?: number | null;
  /** Nur Bearbeiten: Meldet pro Seite, ob der Inhalt aus dem A4-Hauptfenster überläuft (DOM-Messung). */
  onPageLayoutOverflow?: (info: PageLayoutOverflowInfo) => void;
};

export function A4WorksheetRenderer({
  worksheet,
  showGuide = false,
  contentDraft,
  onContentDraftChange,
  onRequestRegeneratePage,
  regeneratePageBusyIndex,
  onPageLayoutOverflow,
}: RendererProps) {
  const rm = worksheet.render_model || {};
  const tokens = rm.tokens || {};
  const pres = rm.presentation || tokens.presentation;
  const ty = typography(pres);
  const pages =
    Array.isArray(rm.pages) && rm.pages.length > 0
      ? rm.pages
      : [{ page_label: '', blocks: rm.blocks || [] }];

  const pageSetup = (rm.page_setup || worksheet.page_setup) as PageSetup;
  const pageOrient = pageSetup?.orientation === 'landscape' ? 'landscape' : 'portrait';
  const pageW = pageSetup?.width_mm ?? 210;
  const pageH = pageSetup?.height_mm ?? 297;
  const printPageCss = `
@media print {
  @page { size: A4 ${pageOrient}; margin: 0; }
  html, body, #root {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .worksheet-paper-stack {
    background: #fff !important;
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .a4-page {
    width: ${pageW}mm !important;
    max-width: none !important;
    height: ${pageH}mm !important;
    min-height: ${pageH}mm !important;
    max-height: ${pageH}mm !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    page-break-after: always;
    break-after: page;
    box-shadow: none !important;
    border: none !important;
    outline: none !important;
  }
  .a4-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
}
`;

  const editCtx =
    contentDraft && onContentDraftChange
      ? { draft: contentDraft, setDraft: onContentDraftChange }
      : undefined;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printPageCss }} />
      <div className="worksheet-paper-stack flex flex-col items-start gap-3 bg-[#eef2f7] print:bg-transparent print:gap-0 text-black antialiased">
        {pages.map((pg: any, i: number) => (
          <A4PageShell
            key={i}
            page={pg}
            pageIndex={i}
            totalPages={pages.length}
            rm={rm}
            worksheet={worksheet}
            ty={ty}
            showGuide={showGuide}
            editCtx={editCtx}
            onRequestRegeneratePage={onRequestRegeneratePage}
            regeneratePageBusyIndex={regeneratePageBusyIndex}
            onPageLayoutOverflow={onPageLayoutOverflow}
          />
        ))}
 </div>
    </>
  );
}
