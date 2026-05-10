import { describe, expect, it } from 'vitest';
import {
  ASSET_STYLE_FAMILY_OPTIONS,
  BLOCKS_MAX_BULLET_LEN,
  BLOCKS_MAX_PAGES,
  BLOCKS_MAX_PAGE_BULLETS,
  BLOCKS_PAGE_BLOCK_LIMIT,
  BLOCKS_PAGE_UNIT_BUDGET,
} from './types';

describe('boards/types Konstanten', () => {
  it('Limits sind plausibel und positiv', () => {
    expect(BLOCKS_MAX_PAGES).toBe(12);
    expect(BLOCKS_PAGE_BLOCK_LIMIT).toBe(6);
    expect(BLOCKS_PAGE_UNIT_BUDGET).toBe(10);
    expect(BLOCKS_MAX_PAGE_BULLETS).toBe(20);
    expect(BLOCKS_MAX_BULLET_LEN).toBe(300);
    for (const v of [
      BLOCKS_MAX_PAGES,
      BLOCKS_PAGE_BLOCK_LIMIT,
      BLOCKS_PAGE_UNIT_BUDGET,
      BLOCKS_MAX_PAGE_BULLETS,
      BLOCKS_MAX_BULLET_LEN,
    ]) {
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe('ASSET_STYLE_FAMILY_OPTIONS', () => {
  it('startet mit "auto"', () => {
    expect(ASSET_STYLE_FAMILY_OPTIONS[0]?.id).toBe('auto');
  });

  it('hat eindeutige IDs', () => {
    const ids = ASSET_STYLE_FAMILY_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('jede Option hat ein nicht-leeres Label', () => {
    for (const opt of ASSET_STYLE_FAMILY_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });

  it('enthält die spezifizierten Style-Familien', () => {
    const ids = ASSET_STYLE_FAMILY_OPTIONS.map((o) => o.id);
    expect(ids).toContain('cute_round_mascot');
    expect(ids).toContain('soft_cartoon');
    expect(ids).toContain('storybook_flat');
    expect(ids).toContain('clean_flat');
    expect(ids).toContain('rough_handdrawn');
    expect(ids).toContain('classroom_icon');
    expect(ids).toContain('science_lab_cartoon');
    expect(ids).toContain('historical_atlas');
    expect(ids).toContain('sticker_toy');
  });
});
