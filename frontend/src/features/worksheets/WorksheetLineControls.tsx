import type { ReactNode } from 'react';
import { CAP_WRITING_LINES, DEFAULT_TASK_LIST_ANSWER_LINES } from './A4WorksheetRenderer';

const MAX_EXTRA_LINES_TEXT_BLOCK = 40;

/** Blocktypen ohne „Extra-Linien“-Felder im Standard-Abschnitt */
const BLOCK_TYPES_WITHOUT_PANEL_LINES = new Set([
  'task_grid',
  'table',
  'drawing_box',
  'checklist',
  'writing_lines',
  'task_list',
]);

function blockHeading(block: Record<string, unknown>, fallback: string): string {
  const t = String(block.title ?? '').trim();
  return t || fallback;
}

type Props = {
  content: Record<string, unknown>;
  onPatchBlock: (pageIndex: number, blockIndex: number, patch: Record<string, unknown>) => void;
  onPatchItem: (
    pageIndex: number,
    blockIndex: number,
    itemIndex: number,
    patch: Record<string, unknown>,
  ) => void;
};

/**
 * Linien-Anzahl-Steuerung außerhalb des A4-Flows, damit das Blattlayout beim Bearbeiten nicht springt.
 */
export function WorksheetLineControls({ content, onPatchBlock, onPatchItem }: Props) {
  const pages = (content.pages as { blocks?: Record<string, unknown>[] }[]) || [];

  const rows: ReactNode[] = [];

  pages.forEach((page, pageIndex) => {
    const pageLabel = `Seite ${pageIndex + 1}`;
    (page.blocks || []).forEach((block, blockIndex) => {
      const type = String(block.type || 'text');

      if (type === 'writing_lines') {
        const raw = block.lines;
        let n: number;
        if (raw == null || raw === '') n = 10;
        else {
          const num = Number(raw);
          n = Number.isFinite(num) && num >= 0 ? Math.min(CAP_WRITING_LINES, Math.floor(num)) : 10;
        }
        rows.push(
          <div
            key={`wl-${pageIndex}-${blockIndex}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
          >
            <span className="min-w-0 flex-1 text-[11px] text-slate-600">
              {pageLabel} · <span className="font-medium text-slate-800">{blockHeading(block, 'Schreiblinien')}</span>
            </span>
            <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-600">
              L.
              <input
                type="number"
                min={0}
                max={CAP_WRITING_LINES}
                title="Anzahl Linien"
                className="h-7 w-[3.25rem] rounded border border-indigo-200 bg-white px-1 py-0 text-xs text-slate-900"
                value={n}
                onChange={(e) =>
                  onPatchBlock(pageIndex, blockIndex, {
                    lines: Math.min(CAP_WRITING_LINES, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
              />
            </label>
          </div>,
        );
        return;
      }

      if (type === 'task_list') {
        const items = (Array.isArray(block.items) ? block.items : []) as unknown[];
        items.forEach((it, itemIndex) => {
          const di =
            typeof it === 'object' && it != null && !Array.isArray(it)
              ? (it as { text?: string; answer_lines?: number })
              : null;
          const textSnippet = String(di?.text ?? (typeof it === 'string' ? it : '') ?? '').trim();
          const short =
            textSnippet.length > 42 ? `${textSnippet.slice(0, 40)}…` : textSnippet || `Aufgabe ${itemIndex + 1}`;
          rows.push(
            <div
              key={`tl-${pageIndex}-${blockIndex}-${itemIndex}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
            >
              <span className="min-w-0 flex-1 text-[11px] text-slate-600">
                {pageLabel} · <span className="italic">{short}</span>
              </span>
              <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-600">
                <span title="Antwortlinien">Antw.</span>
                <input
                  type="number"
                  min={0}
                  max={CAP_WRITING_LINES}
                  title="Antwortlinien"
                  className="h-7 w-[3rem] rounded border border-indigo-200 bg-white px-1 py-0 text-xs text-slate-900"
                  value={Number(di?.answer_lines ?? '') || ''}
                  placeholder={`${DEFAULT_TASK_LIST_ANSWER_LINES}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') onPatchItem(pageIndex, blockIndex, itemIndex, { answer_lines: undefined });
                    else
                      onPatchItem(pageIndex, blockIndex, itemIndex, {
                        answer_lines: Math.min(CAP_WRITING_LINES, Math.max(0, parseInt(v, 10) || 0)),
                      });
                  }}
                />
              </label>
            </div>,
          );
        });
        return;
      }

      if (!BLOCK_TYPES_WITHOUT_PANEL_LINES.has(type)) {
        const raw = block.lines;
        let display = 0;
        if (raw != null && raw !== '') {
          const n = Number(raw);
          display = Number.isFinite(n) ? Math.min(MAX_EXTRA_LINES_TEXT_BLOCK, Math.max(0, Math.floor(n))) : 0;
        }
        rows.push(
          <div
            key={`ex-${pageIndex}-${blockIndex}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
          >
            <span className="min-w-0 flex-1 text-[11px] text-slate-600">
              {pageLabel} · <span className="font-medium text-slate-800">{blockHeading(block, 'Abschnitt')}</span>
              {type !== 'text' ? (
                <span className="ml-1 text-slate-400">({type})</span>
              ) : null}
            </span>
            <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-600">
              <span title="Zusätzliche Linien unter dem Text">+L</span>
              <input
                type="number"
                min={0}
                max={MAX_EXTRA_LINES_TEXT_BLOCK}
                title="Zusätzliche Linien"
                className="h-7 w-[3rem] rounded border border-indigo-200 bg-white px-1 py-0 text-xs text-slate-900"
                value={display || 0}
                onChange={(e) =>
                  onPatchBlock(pageIndex, blockIndex, {
                    lines: Math.min(
                      MAX_EXTRA_LINES_TEXT_BLOCK,
                      Math.max(0, parseInt(e.target.value, 10) || 0),
                    ),
                  })
                }
              />
            </label>
          </div>,
        );
      }
    });
  });

  if (rows.length === 0) return null;

  return (
    <section
      className="no-print rounded-lg border border-indigo-100/90 bg-indigo-50/50 px-2.5 py-2 shadow-sm"
      aria-label="Linien-Einstellungen"
    >
      <h2 className="text-[10px] font-semibold uppercase tracking-wide text-indigo-900/90">
        {'Linien & Schreibfläche'}
      </h2>
      <div className="mt-1.5 max-h-24 space-y-1 overflow-y-auto pr-0.5 text-[11px] leading-tight">{rows}</div>
    </section>
  );
}
