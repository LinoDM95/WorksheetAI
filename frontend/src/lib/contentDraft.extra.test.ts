import { describe, expect, it } from 'vitest';

import {
  WORKSHEET_CREATIVE_RENDER_KIND,
  appendDraftPage,
  applyPlainMathHints,
  createDefaultWorksheetBlock,
  insertDraftBlock,
  insertDraftChecklistItem,
  insertDraftTaskGridItem,
  insertDraftTaskListItem,
  isCreativeHtmlWorksheetContent,
  moveDraftBlockBetweenPages,
  removeDraftBlock,
  removeDraftChecklistItem,
  removeDraftPage,
  removeDraftTaskGridItem,
  removeDraftTaskListItem,
  reorderDraftBlockItems,
  updateDraftBlockItem,
  WORKSHEET_BLOCK_OPTIONS,
} from './contentDraft';

const baseDraft = (): Record<string, unknown> => ({
  pages: [
    {
      blocks: [
        { id: 'a', type: 'text', content: 'erst' },
        {
          id: 'b',
          type: 'task_list',
          items: [
            { text: 'A', answer_lines: 4 },
            { text: 'B', answer_lines: 5 },
          ],
        },
      ],
    },
    { blocks: [{ id: 'c', type: 'text', content: 'seite2' }] },
  ],
});

describe('isCreativeHtmlWorksheetContent', () => {
  it('false bei null/undefined/leer', () => {
    expect(isCreativeHtmlWorksheetContent(null)).toBe(false);
    expect(isCreativeHtmlWorksheetContent(undefined)).toBe(false);
    expect(isCreativeHtmlWorksheetContent({})).toBe(false);
  });

  it('true mit explizitem render_kind', () => {
    expect(
      isCreativeHtmlWorksheetContent({ render_kind: WORKSHEET_CREATIVE_RENDER_KIND }),
    ).toBe(true);
  });

  it('true wenn alle Seiten html und keine blocks haben', () => {
    expect(
      isCreativeHtmlWorksheetContent({
        pages: [{ html: '<p>x</p>' }, { html: '<p>y</p>' }],
      }),
    ).toBe(true);
  });

  it('false wenn eine Seite blocks hat', () => {
    expect(
      isCreativeHtmlWorksheetContent({
        pages: [{ html: '<p>x</p>' }, { html: '<p>y</p>', blocks: [{ type: 'text' }] }],
      }),
    ).toBe(false);
  });

  it('false wenn html leer/whitespace', () => {
    expect(isCreativeHtmlWorksheetContent({ pages: [{ html: '   ' }] })).toBe(false);
  });
});

describe('updateDraftBlockItem', () => {
  it('patcht Item-Objekt', () => {
    const n = updateDraftBlockItem(baseDraft(), 0, 1, 0, { answer_lines: 10 });
    const item = (n.pages as { blocks: { items: { answer_lines: number }[] }[] }[])[0].blocks[1].items[0];
    expect(item.answer_lines).toBe(10);
  });

  it('konvertiert string-item zu Objekt mit text', () => {
    const d: Record<string, unknown> = {
      pages: [{ blocks: [{ type: 'task_list', items: ['legacy'] }] }],
    };
    const n = updateDraftBlockItem(d, 0, 0, 0, { answer_lines: 3 });
    const it = (n.pages as { blocks: { items: { text: string; answer_lines: number }[] }[] }[])[0].blocks[0].items[0];
    expect(it.text).toBe('legacy');
    expect(it.answer_lines).toBe(3);
  });

  it('returnt original bei out-of-range', () => {
    const d = baseDraft();
    expect(updateDraftBlockItem(d, 0, 1, 99, {})).toBe(d);
    expect(updateDraftBlockItem(d, 0, 0, 0, {})).toBe(d); // text-Block hat keine items
  });
});

describe('insertDraftBlock & removeDraftBlock', () => {
  it('insert am Anfang', () => {
    const block = { id: 'x', type: 'text', content: 'X' };
    const n = insertDraftBlock(baseDraft(), 0, 0, block);
    expect((n.pages as { blocks: { id: string }[] }[])[0].blocks[0].id).toBe('x');
  });

  it('insert am Ende, wenn atIndex zu groß', () => {
    const block = { id: 'z', type: 'text', content: 'Z' };
    const n = insertDraftBlock(baseDraft(), 0, 999, block);
    const blocks = (n.pages as { blocks: { id: string }[] }[])[0].blocks;
    expect(blocks[blocks.length - 1].id).toBe('z');
  });

  it('insert returnt original bei ungültiger pageIndex', () => {
    const d = baseDraft();
    expect(insertDraftBlock(d, 99, 0, { type: 'text' })).toBe(d);
  });

  it('remove löscht den Block', () => {
    const n = removeDraftBlock(baseDraft(), 0, 0);
    expect((n.pages as { blocks: { id: string }[] }[])[0].blocks).toHaveLength(1);
    expect((n.pages as { blocks: { id: string }[] }[])[0].blocks[0].id).toBe('b');
  });

  it('remove returnt original bei ungültigem Index', () => {
    const d = baseDraft();
    expect(removeDraftBlock(d, 0, 99)).toBe(d);
    expect(removeDraftBlock(d, 99, 0)).toBe(d);
  });
});

describe('reorderDraftBlockItems', () => {
  it('reordert task_list items', () => {
    const n = reorderDraftBlockItems(baseDraft(), 0, 1, 0, 1);
    const items = (n.pages as { blocks: { items: { text: string }[] }[] }[])[0].blocks[1].items;
    expect(items[0].text).toBe('B');
    expect(items[1].text).toBe('A');
  });

  it('returnt original wenn block nicht task_list/grid/checklist', () => {
    const d = baseDraft();
    expect(reorderDraftBlockItems(d, 0, 0, 0, 0)).toBe(d);
  });
});

describe('moveDraftBlockBetweenPages', () => {
  it('verschiebt Block von Seite 0 nach Seite 1', () => {
    const n = moveDraftBlockBetweenPages(baseDraft(), 0, 0, 1, 0);
    const p0 = (n.pages as { blocks: { id: string }[] }[])[0].blocks;
    const p1 = (n.pages as { blocks: { id: string }[] }[])[1].blocks;
    expect(p0).toHaveLength(1);
    expect(p1.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('returnt original bei ungültigen Indizes', () => {
    const d = baseDraft();
    expect(moveDraftBlockBetweenPages(d, 99, 0, 0, 0)).toBe(d);
    expect(moveDraftBlockBetweenPages(d, 0, 99, 0, 0)).toBe(d);
  });
});

describe('appendDraftPage / removeDraftPage', () => {
  it('appendet neue Block-Seite mit optionalem Starter-Text', () => {
    const n = appendDraftPage(baseDraft(), true);
    const pages = n.pages as { blocks: unknown[] }[];
    expect(pages).toHaveLength(3);
    expect(pages[2].blocks).toHaveLength(1);
  });

  it('appendet Creative-Seite mit html', () => {
    const draft = { render_kind: WORKSHEET_CREATIVE_RENDER_KIND, pages: [{ html: '<p>x</p>' }] };
    const n = appendDraftPage(draft);
    const pages = n.pages as { html?: string }[];
    expect(pages).toHaveLength(2);
    expect(pages[1].html).toContain('Neue Seite');
  });

  it('remove behält mind. eine Seite', () => {
    const d = { pages: [{ blocks: [] }] };
    expect(removeDraftPage(d, 0)).toBe(d);
  });

  it('remove löscht die Seite', () => {
    const n = removeDraftPage(baseDraft(), 0);
    expect((n.pages as unknown[]).length).toBe(1);
  });
});

describe('insert/removeDraftTaskListItem', () => {
  it('insert fügt am Index', () => {
    const n = insertDraftTaskListItem(baseDraft(), 0, 1, 1);
    const items = (n.pages as { blocks: { items: unknown[] }[] }[])[0].blocks[1].items;
    expect(items).toHaveLength(3);
  });

  it('remove löscht das Item', () => {
    const n = removeDraftTaskListItem(baseDraft(), 0, 1, 0);
    const items = (n.pages as { blocks: { items: { text: string }[] }[] }[])[0].blocks[1].items;
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('B');
  });

  it('remove returnt original bei ungültigem item-index', () => {
    const d = baseDraft();
    expect(removeDraftTaskListItem(d, 0, 1, 99)).toBe(d);
    expect(removeDraftTaskListItem(d, 0, 0, 0)).toBe(d); // Block ist text, nicht task_list
  });
});

describe('insert/removeDraftTaskGridItem', () => {
  const draftWithGrid = (): Record<string, unknown> => ({
    pages: [
      {
        blocks: [
          {
            id: 'g',
            type: 'task_grid',
            items: [
              { label: 'a', text: 'A', answer: '' },
              { label: 'b', text: 'B', answer: '' },
            ],
          },
        ],
      },
    ],
  });

  it('insert fügt mit auto-label', () => {
    const n = insertDraftTaskGridItem(draftWithGrid(), 0, 0, 2);
    const items = (n.pages as { blocks: { items: { label: string }[] }[] }[])[0].blocks[0].items;
    expect(items).toHaveLength(3);
    expect(items[2].label).toBe('c');
  });

  it('remove löscht', () => {
    const n = removeDraftTaskGridItem(draftWithGrid(), 0, 0, 0);
    const items = (n.pages as { blocks: { items: { label: string }[] }[] }[])[0].blocks[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('b');
  });

  it('remove kein Effekt auf falschem Block-Typ', () => {
    const d = baseDraft();
    expect(removeDraftTaskGridItem(d, 0, 0, 0)).toBe(d);
  });
});

describe('insert/removeDraftChecklistItem', () => {
  const draftWithCheck = (): Record<string, unknown> => ({
    pages: [
      {
        blocks: [{ id: 'cl', type: 'checklist', items: [{ text: 'eins' }, { text: 'zwei' }] }],
      },
    ],
  });

  it('insert fügt am Anfang', () => {
    const n = insertDraftChecklistItem(draftWithCheck(), 0, 0, 0);
    const items = (n.pages as { blocks: { items: { text: string }[] }[] }[])[0].blocks[0].items;
    expect(items).toHaveLength(3);
    expect(items[0].text).toContain('Punkt');
  });

  it('remove löscht', () => {
    const n = removeDraftChecklistItem(draftWithCheck(), 0, 0, 1);
    const items = (n.pages as { blocks: { items: { text: string }[] }[] }[])[0].blocks[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('eins');
  });
});

describe('createDefaultWorksheetBlock — alle Kinds', () => {
  it.each(WORKSHEET_BLOCK_OPTIONS.map((o) => o.value))('liefert valides Default für %s', (kind) => {
    const b = createDefaultWorksheetBlock(kind);
    expect(b.type).toBe(kind);
    expect(typeof b.id).toBe('string');
    expect((b.id as string).length).toBeGreaterThan(0);
  });

  it('writing_lines hat default lines', () => {
    const b = createDefaultWorksheetBlock('writing_lines');
    expect((b as { lines: number }).lines).toBeGreaterThan(0);
  });

  it('table hat columns + rows', () => {
    const b = createDefaultWorksheetBlock('table');
    expect((b as { columns: unknown[] }).columns.length).toBeGreaterThan(0);
    expect((b as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
  });
});

describe('applyPlainMathHints', () => {
  it('wraps single-line numeric expression in $...$', () => {
    expect(applyPlainMathHints('2 + 3 = 5')).toBe('$2 + 3 = 5$');
  });

  it('ignoriert wenn schon LaTeX-Marker enthalten', () => {
    expect(applyPlainMathHints('Beispiel $x=1$')).toBe('Beispiel $x=1$');
  });

  it('ersetzt Unicode hoch-2/3 zu ^2/^3', () => {
    expect(applyPlainMathHints('a² + b³ = c² + d')).toContain('^2');
    expect(applyPlainMathHints('a² + b³ = c² + d')).toContain('^3');
  });

  it('ersetzt · und × zu \\cdot', () => {
    expect(applyPlainMathHints('a · b')).toContain('\\cdot');
    expect(applyPlainMathHints('a × b')).toContain('\\cdot');
  });

  it('ignoriert sehr lange Strings (>120)', () => {
    const long = 'a + b = c '.repeat(20);
    expect(applyPlainMathHints(long)).toBe(long);
  });

  it('ignoriert Multi-Line', () => {
    const multi = 'a + b\n= c';
    expect(applyPlainMathHints(multi)).not.toMatch(/^\$/);
  });

  it('ignoriert Strings ohne Operator', () => {
    expect(applyPlainMathHints('Nur Text 123')).toBe('Nur Text 123');
  });
});
