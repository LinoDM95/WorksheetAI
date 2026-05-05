import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetBuilderInstanceCounter,
  builderReducer,
  canAddPage,
  canAddSlot,
  initialBuilderState,
  pageUnitsUsed,
  type BuilderState,
} from './useBoardBuilderState';
import type { BlockRegistryEntry } from '../types';
import {
  BLOCKS_MAX_BULLET_LEN,
  BLOCKS_MAX_PAGE_BULLETS,
  BLOCKS_MAX_PAGES,
  BLOCKS_PAGE_BLOCK_LIMIT,
  BLOCKS_PAGE_UNIT_BUDGET,
} from '../types';

const REGISTRY: BlockRegistryEntry[] = [
  {
    id: 'textkarte',
    label: 'Textkarte',
    category: 'universal',
    size_weight: 2,
    help_text: '',
    content_schema: {},
    default_content: {},
  },
  {
    id: 'aufdeckkarte',
    label: 'Aufdeck',
    category: 'universal',
    size_weight: 1,
    help_text: '',
    content_schema: {},
    default_content: {},
  },
  {
    id: 'schritt',
    label: 'Schritt',
    category: 'universal',
    size_weight: 3,
    help_text: '',
    content_schema: {},
    default_content: {},
  },
];

const text = REGISTRY[0];
const aufdeck = REGISTRY[1];
const schritt = REGISTRY[2];

beforeEach(() => __resetBuilderInstanceCounter(0));

describe('builderReducer.initial', () => {
  it('starts with one empty page (no slots, no bullets)', () => {
    const s = initialBuilderState();
    expect(s.plan.pages).toHaveLength(1);
    expect(s.plan.pages[0].block_slots).toHaveLength(0);
    expect(s.plan.pages[0].bullets).toEqual([]);
    expect(s.pageIndex).toBe(0);
  });
});

describe('builderReducer.set_meta', () => {
  it('updates fields on the plan', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'set_meta', field: 'subject', value: 'Mathe' });
    s = builderReducer(s, { type: 'set_meta', field: 'theme_id', value: 'science' });
    s = builderReducer(s, { type: 'set_meta', field: 'style_hint', value: 'kindgerecht' });
    expect(s.plan.subject).toBe('Mathe');
    expect(s.plan.theme_id).toBe('science');
    expect(s.plan.style_hint).toBe('kindgerecht');
  });
});

describe('builderReducer.add/remove_page', () => {
  it('adds a page and selects it', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'add_page' });
    expect(s.plan.pages).toHaveLength(2);
    expect(s.pageIndex).toBe(1);
  });
  it('does not exceed BLOCKS_MAX_PAGES', () => {
    let s = initialBuilderState();
    for (let i = 0; i < BLOCKS_MAX_PAGES + 5; i += 1) s = builderReducer(s, { type: 'add_page' });
    expect(s.plan.pages.length).toBeLessThanOrEqual(BLOCKS_MAX_PAGES);
  });
  it('removes a page but keeps at least one', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'add_page' });
    s = builderReducer(s, { type: 'remove_page', pageIndex: 0 });
    expect(s.plan.pages).toHaveLength(1);
    s = builderReducer(s, { type: 'remove_page', pageIndex: 0 });
    expect(s.plan.pages).toHaveLength(1);
  });
});

describe('builderReducer.set_page_bullets', () => {
  it('caps bullets to BLOCKS_MAX_PAGE_BULLETS and trims', () => {
    let s = initialBuilderState();
    const many = Array.from({ length: BLOCKS_MAX_PAGE_BULLETS + 5 }, (_, i) => `  • Bullet ${i}  `);
    s = builderReducer(s, { type: 'set_page_bullets', pageIndex: 0, bullets: many });
    expect(s.plan.pages[0].bullets.length).toBe(BLOCKS_MAX_PAGE_BULLETS);
    expect(s.plan.pages[0].bullets[0]).toBe('Bullet 0');
  });
  it('drops empty entries', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'set_page_bullets', pageIndex: 0, bullets: ['eins', '   ', '', 'zwei'] });
    expect(s.plan.pages[0].bullets).toEqual(['eins', 'zwei']);
  });
  it('caps each bullet line length', () => {
    let s = initialBuilderState();
    const longLine = 'x'.repeat(BLOCKS_MAX_BULLET_LEN + 50);
    s = builderReducer(s, { type: 'set_page_bullets', pageIndex: 0, bullets: [longLine] });
    expect(s.plan.pages[0].bullets[0].length).toBe(BLOCKS_MAX_BULLET_LEN);
  });
});

describe('builderReducer.add_slot + limits', () => {
  it('respects per-page slot count limit', () => {
    let s: BuilderState = initialBuilderState();
    for (let i = 0; i < BLOCKS_PAGE_BLOCK_LIMIT + 2; i += 1) {
      const page = s.plan.pages[0];
      if (canAddSlot(page, REGISTRY, aufdeck)) {
        s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: aufdeck });
      }
    }
    expect(s.plan.pages[0].block_slots.length).toBe(BLOCKS_PAGE_BLOCK_LIMIT);
  });
  it('respects unit budget', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: schritt });
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: schritt });
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: schritt });
    expect(pageUnitsUsed(s.plan.pages[0], REGISTRY)).toBe(9);
    expect(canAddSlot(s.plan.pages[0], REGISTRY, schritt)).toBe(false);
  });
  it('creates a slot with empty hint', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: text });
    const slot = s.plan.pages[0].block_slots[0];
    expect(slot.block_id).toBe('textkarte');
    expect(slot.hint).toBe('');
    expect(slot.instance_id).toMatch(/^textkarte-/);
  });
});

describe('builderReducer.move/remove_slot', () => {
  it('reorders slots correctly', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: text });
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: aufdeck });
    expect(s.plan.pages[0].block_slots.map((b) => b.block_id)).toEqual(['textkarte', 'aufdeckkarte']);
    s = builderReducer(s, {
      type: 'move_slot',
      pageIndex: 0,
      instanceId: s.plan.pages[0].block_slots[0].instance_id,
      direction: 1,
    });
    expect(s.plan.pages[0].block_slots.map((b) => b.block_id)).toEqual(['aufdeckkarte', 'textkarte']);
  });
  it('removes a slot', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: text });
    const id = s.plan.pages[0].block_slots[0].instance_id;
    s = builderReducer(s, { type: 'remove_slot', pageIndex: 0, instanceId: id });
    expect(s.plan.pages[0].block_slots.length).toBe(0);
  });
});

describe('builderReducer.set_slot_hint', () => {
  it('updates hint and caps length', () => {
    let s = initialBuilderState();
    s = builderReducer(s, { type: 'add_slot', pageIndex: 0, block: text });
    const id = s.plan.pages[0].block_slots[0].instance_id;
    const longHint = 'x'.repeat(500);
    s = builderReducer(s, { type: 'set_slot_hint', pageIndex: 0, instanceId: id, hint: longHint });
    expect(s.plan.pages[0].block_slots[0].hint.length).toBe(200);
  });
});

describe('canAddPage', () => {
  it('false at limit', () => {
    let s = initialBuilderState();
    while (canAddPage(s.plan)) {
      s = builderReducer(s, { type: 'add_page' });
    }
    expect(canAddPage(s.plan)).toBe(false);
    expect(s.plan.pages.length).toBe(BLOCKS_MAX_PAGES);
  });
});
