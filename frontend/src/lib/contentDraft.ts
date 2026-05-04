import { arrayMove } from '@dnd-kit/sortable';

export function updateDraftRoot(
  draft: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...JSON.parse(JSON.stringify(draft)), ...patch };
}

/** Unveränderlich: einen Block in content.pages[pi].blocks[bi] patchen */
export function updateDraftBlock(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  const block = pages?.[pageIndex]?.blocks?.[blockIndex];
  if (!block) return draft;
  Object.assign(block, patch);
  return next;
}

export function updateDraftBlockItem(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  itemIndex: number,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  const items = pages?.[pageIndex]?.blocks?.[blockIndex]?.items as unknown[] | undefined;
  if (!items || itemIndex < 0 || itemIndex >= items.length) return draft;
  const row = items[itemIndex];
  if (typeof row === 'string') {
    items[itemIndex] = { text: row, ...patch };
    return next;
  }
  if (!row || typeof row !== 'object') return draft;
  Object.assign(row as Record<string, unknown>, patch);
  return next;
}

/** Standard-Linienzahl für neue nummerierte Teilaufgaben (wie task_list ohne expliziten Wert) */
export const DEFAULT_NEW_TASKLIST_ANSWER_LINES = 6;

export type WorksheetBlockKind =
  | 'text'
  | 'task_list'
  | 'task_grid'
  | 'writing_lines'
  | 'drawing_box'
  | 'diagram'
  | 'checklist'
  | 'table';

function newWorksheetBlockId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Stabile IDs für Drag-and-Drop (fehlende `id` auf Blöcken setzen). */
export function ensureDraftBlockIds(draft: Record<string, unknown>): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  if (!pages) return next;
  for (const p of pages) {
    const blocks = p.blocks || [];
    for (const b of blocks) {
      if (b && typeof b === 'object' && !String((b as { id?: unknown }).id ?? '').trim()) {
        (b as Record<string, unknown>).id = newWorksheetBlockId();
      }
    }
  }
  return next;
}

/** Blöcke auf einer Seite umsortieren (Indizes nach @dnd-kit/sortable). */
export function reorderDraftBlocksOnPage(
  draft: Record<string, unknown>,
  pageIndex: number,
  from: number,
  to: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  const bl = pages?.[pageIndex]?.blocks;
  if (!bl || from < 0 || from >= bl.length || to < 0 || to >= bl.length) return draft;
  const moved = arrayMove(bl, from, to);
  pages![pageIndex] = { ...pages![pageIndex], blocks: moved };
  return next;
}

/** Teilaufgaben / Rasterzeilen / Checklistenpunkte innerhalb eines Blocks umsortieren. */
export function reorderDraftBlockItems(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  from: number,
  to: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const block = (next.pages as { blocks?: Record<string, unknown>[] }[] | undefined)?.[pageIndex]?.blocks?.[
    blockIndex
  ];
  if (!block) return draft;
  const t = String(block.type || '');
  if (!['task_list', 'task_grid', 'checklist'].includes(t)) return draft;
  const itemsArr = block.items as unknown[] | undefined;
  if (!itemsArr || from < 0 || from >= itemsArr.length || to < 0 || to >= itemsArr.length) return draft;
  block.items = arrayMove([...itemsArr], from, to) as unknown;
  return next;
}

/** Block von einer Seite auf eine andere verschieben (Index `toIndex` in aktueller Ziel-Liste vor dem Einfügen). */
export function moveDraftBlockBetweenPages(
  draft: Record<string, unknown>,
  fromPage: number,
  fromIndex: number,
  toPage: number,
  toIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  if (!pages || fromPage < 0 || fromPage >= pages.length || toPage < 0 || toPage >= pages.length) return draft;
  const fromBlocks = [...(pages[fromPage].blocks || [])];
  if (fromIndex < 0 || fromIndex >= fromBlocks.length) return draft;
  const [moved] = fromBlocks.splice(fromIndex, 1);
  pages[fromPage] = { ...pages[fromPage], blocks: fromBlocks };
  const toBlocks = [...(pages[toPage].blocks || [])];
  const ins = Math.max(0, Math.min(toIndex, toBlocks.length));
  toBlocks.splice(ins, 0, moved);
  pages[toPage] = { ...pages[toPage], blocks: toBlocks };
  next.pages = pages;
  return next;
}

export const WORKSHEET_BLOCK_OPTIONS: { value: WorksheetBlockKind; label: string }[] = [
  { value: 'text', label: 'Abschnitt (Titel + Text)' },
  { value: 'task_list', label: 'Nummerierte Aufgaben' },
  { value: 'task_grid', label: 'Aufgaben-Raster' },
  { value: 'writing_lines', label: 'Schreiblinien' },
  { value: 'drawing_box', label: 'Zeichenfeld' },
  { value: 'diagram', label: 'Diagramm (SVG)' },
  { value: 'checklist', label: 'Checkliste' },
  { value: 'table', label: 'Tabelle (2×2)' },
];

export function createDefaultWorksheetBlock(kind: WorksheetBlockKind): Record<string, unknown> {
  const id = newWorksheetBlockId();
  switch (kind) {
    case 'text':
      return { id, type: 'text', title: 'Neuer Abschnitt', content: '', lines: 0 };
    case 'task_list':
      return {
        id,
        type: 'task_list',
        title: 'Aufgaben',
        items: [{ text: 'Neue Teilaufgabe', answer_lines: DEFAULT_NEW_TASKLIST_ANSWER_LINES }],
      };
    case 'task_grid':
      return {
        id,
        type: 'task_grid',
        title: 'Aufgaben',
        items: [
          { label: 'a', text: 'Aufgabe a', answer: '' },
          { label: 'b', text: 'Aufgabe b', answer: '' },
        ],
      };
    case 'writing_lines':
      return { id, type: 'writing_lines', title: 'Schreibfläche', lines: 8 };
    case 'diagram':
      return {
        id,
        type: 'diagram',
        title: 'Diagramm',
        figure_label: 'Abb. 1',
        instruction: '',
        spec: {
          kind: 'unit_circle',
          angle_deg: 45,
          show_angle_arc: true,
          show_projections: true,
          point_label: 'P',
          radius_label: '1',
        },
      };
    case 'drawing_box':
      return {
        id,
        type: 'drawing_box',
        title: 'Skizze / Zeichnung',
        instruction: 'Zeichnen oder beschriften Sie im Kasten.',
        height_mm: 50,
        expand_to_page_bottom: false,
      };
    case 'checklist':
      return { id, type: 'checklist', title: 'Checkliste', items: [{ text: 'Neuer Punkt' }] };
    case 'table':
      return {
        id,
        type: 'table',
        title: 'Tabelle',
        columns: [
          { key: 'a', label: 'Spalte A' },
          { key: 'b', label: 'Spalte B' },
        ],
        rows: [
          { a: '', b: '' },
          { a: '', b: '' },
        ],
      };
    default:
      return { id, type: 'text', title: 'Text', content: '', lines: 0 };
  }
}

export function insertDraftBlock(
  draft: Record<string, unknown>,
  pageIndex: number,
  atIndex: number,
  block: Record<string, unknown>,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  if (!pages || pageIndex < 0 || pageIndex >= pages.length) return draft;
  const page = pages[pageIndex];
  const bl = [...(page.blocks || [])];
  const i = Math.max(0, Math.min(atIndex, bl.length));
  bl.splice(i, 0, block);
  pages[pageIndex] = { ...page, blocks: bl };
  next.pages = pages;
  return next;
}

export function removeDraftBlock(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = next.pages as { blocks?: Record<string, unknown>[] }[] | undefined;
  if (!pages || pageIndex < 0 || pageIndex >= pages.length) return draft;
  const page = pages[pageIndex];
  const bl = page.blocks ? [...page.blocks] : null;
  if (!bl || blockIndex < 0 || blockIndex >= bl.length) return draft;
  bl.splice(blockIndex, 1);
  pages[pageIndex] = { ...page, blocks: bl };
  next.pages = pages;
  return next;
}

export function appendDraftPage(
  draft: Record<string, unknown>,
  withStarterTextBlock?: boolean,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const pages = [...(((next.pages as { blocks?: unknown[] }[]) || []) as { page_label?: string; blocks: unknown[] }[])];
  pages.push({
    page_label: '',
    blocks: withStarterTextBlock ? [createDefaultWorksheetBlock('text')] : [],
  });
  next.pages = pages;
  return next;
}

export function removeDraftPage(draft: Record<string, unknown>, pageIndex: number): Record<string, unknown> {
  const pages = (draft.pages as { blocks?: unknown[] }[]) || [];
  if (pages.length <= 1 || pageIndex < 0 || pageIndex >= pages.length) return draft;
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const nextPages = [...pages];
  nextPages.splice(pageIndex, 1);
  next.pages = nextPages;
  return next;
}

export function insertDraftTaskListItem(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  atItemIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const block = (next.pages as { blocks?: Record<string, unknown>[] }[] | undefined)?.[pageIndex]?.blocks?.[blockIndex];
  if (!block || block.type !== 'task_list') return draft;
  const items = [...(Array.isArray(block.items) ? (block.items as unknown[]) : [])];
  const i = Math.max(0, Math.min(atItemIndex, items.length));
  items.splice(i, 0, { text: 'Neue Teilaufgabe', answer_lines: DEFAULT_NEW_TASKLIST_ANSWER_LINES });
  block.items = items;
  return next;
}

export function removeDraftTaskListItem(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  itemIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const block = (next.pages as { blocks?: Record<string, unknown>[] }[] | undefined)?.[pageIndex]?.blocks?.[blockIndex];
  if (!block || block.type !== 'task_list') return draft;
  const items = [...(Array.isArray(block.items) ? (block.items as unknown[]) : [])];
  if (itemIndex < 0 || itemIndex >= items.length) return draft;
  items.splice(itemIndex, 1);
  block.items = items;
  return next;
}

export function insertDraftTaskGridItem(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  atItemIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const block = (next.pages as { blocks?: Record<string, unknown>[] }[] | undefined)?.[pageIndex]?.blocks?.[blockIndex];
  if (!block || block.type !== 'task_grid') return draft;
  const prev = Array.isArray(block.items) ? (block.items as { label?: string; text?: string; answer?: string }[]) : [];
  const items = [...prev];
  const n = items.length + 1;
  const label = String.fromCharCode('a'.charCodeAt(0) + ((n - 1) % 26));
  const i = Math.max(0, Math.min(atItemIndex, items.length));
  items.splice(i, 0, { label, text: 'Neue Aufgabe', answer: '' });
  block.items = items;
  return next;
}

export function removeDraftTaskGridItem(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  itemIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const block = (next.pages as { blocks?: Record<string, unknown>[] }[] | undefined)?.[pageIndex]?.blocks?.[blockIndex];
  if (!block || block.type !== 'task_grid') return draft;
  const items = [...(Array.isArray(block.items) ? (block.items as unknown[]) : [])];
  if (itemIndex < 0 || itemIndex >= items.length) return draft;
  items.splice(itemIndex, 1);
  block.items = items;
  return next;
}

export function insertDraftChecklistItem(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  atItemIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const block = (next.pages as { blocks?: Record<string, unknown>[] }[] | undefined)?.[pageIndex]?.blocks?.[blockIndex];
  if (!block || block.type !== 'checklist') return draft;
  const items = [...(Array.isArray(block.items) ? (block.items as unknown[]) : [])];
  const i = Math.max(0, Math.min(atItemIndex, items.length));
  items.splice(i, 0, { text: 'Neuer Punkt' });
  block.items = items;
  return next;
}

export function removeDraftChecklistItem(
  draft: Record<string, unknown>,
  pageIndex: number,
  blockIndex: number,
  itemIndex: number,
): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  const block = (next.pages as { blocks?: Record<string, unknown>[] }[] | undefined)?.[pageIndex]?.blocks?.[blockIndex];
  if (!block || block.type !== 'checklist') return draft;
  const items = [...(Array.isArray(block.items) ? (block.items as unknown[]) : [])];
  if (itemIndex < 0 || itemIndex >= items.length) return draft;
  items.splice(itemIndex, 1);
  block.items = items;
  return next;
}

/**
 * Ohne $…$/\[…\] : typische Tippfehler → LaTeX-Nähe; bei klarer Ein-Zeilen-Formel in $…$ fassen.
 * Kein Ersatz für echte Formeleditoren — lange Fließtexte unverändert lassen.
 */
export function applyPlainMathHints(input: string): string {
  if (!input || /\$|\\\(|\\\[/.test(input)) return input;
  const trimmed = input.trim();
  if (trimmed.length > 120) return input;

  let s = input
    .replace(/\u00b2/g, '^2')
    .replace(/\u00b3/g, '^3')
    .replace(/·|×/g, '\\cdot ')
    .replace(/÷/g, '\\div ');

  const lines = s.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length !== 1) return s;

  const one = s.trim();
  if (
    /^[0-9+\-*/^=\s().a-zA-ZÄÖÜäöüß]{3,80}$/.test(one) &&
    /[0-9]/.test(one) &&
    /[+\-*/^=]/.test(one)
  ) {
    return `$${one}$`;
  }

  return s;
}
