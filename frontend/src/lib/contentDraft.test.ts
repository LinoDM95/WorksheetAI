import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultWorksheetBlock,
  ensureDraftBlockIds,
  reorderDraftBlocksOnPage,
  updateDraftBlock,
  updateDraftRoot,
} from './contentDraft';

describe('contentDraft', () => {
  const baseDraft = (): Record<string, unknown> => ({
    pages: [{ blocks: [{ type: 'text', content: 'a' }] }],
  });

  it('updateDraftRoot merges shallow keys', () => {
    const d = baseDraft();
    const n = updateDraftRoot(d, { title: 'T' });
    expect(n.title).toBe('T');
    expect((n.pages as unknown[]).length).toBe(1);
    expect(n).not.toBe(d);
  });

  it('updateDraftBlock patches nested block', () => {
    const d = baseDraft();
    const n = updateDraftBlock(d, 0, 0, { content: 'b' });
    expect(((n.pages as { blocks: { content: string }[] }[])[0].blocks[0].content)).toBe('b');
  });

  it('updateDraftBlock returns original when index invalid', () => {
    const d = baseDraft();
    const n = updateDraftBlock(d, 0, 9, { content: 'x' });
    expect(n).toBe(d);
  });

  it('ensureDraftBlockIds fills missing id', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    const d: Record<string, unknown> = { pages: [{ blocks: [{ type: 'text' }] }] };
    const n = ensureDraftBlockIds(d);
    expect((n.pages as { blocks: { id: string }[] }[])[0].blocks[0].id).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    spy.mockRestore();
  });

  it('reorderDraftBlocksOnPage moves block', () => {
    const d: Record<string, unknown> = {
      pages: [{ blocks: [{ id: 'a', type: 'text' }, { id: 'b', type: 'text' }] }],
    };
    const n = reorderDraftBlocksOnPage(d, 0, 0, 1);
    expect((n.pages as { blocks: { id: string }[] }[])[0].blocks.map((b) => b.id)).toEqual(['b', 'a']);
  });

  it('createDefaultWorksheetBlock task_list has items', () => {
    const b = createDefaultWorksheetBlock('task_list');
    expect(b.type).toBe('task_list');
    expect(Array.isArray((b as { items: unknown[] }).items)).toBe(true);
  });
});
