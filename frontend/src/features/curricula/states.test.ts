import { describe, expect, it } from 'vitest';
import {
  BERLIN_BRANDENBURG_DISPLAY,
  BERLIN_BRANDENBURG_SLUG,
  DOCUMENT_TYPE_OPTIONS,
  FEDERAL_STATE_OPTIONS,
  findStateOption,
} from './states';

describe('FEDERAL_STATE_OPTIONS', () => {
  it('enthält 16 Bundesländer + Berlin/Brandenburg-Aggregat', () => {
    // 16 Bundesländer + 1 Berlin/Brandenburg = 17
    expect(FEDERAL_STATE_OPTIONS.length).toBe(17);
  });

  it('alle slugs sind eindeutig', () => {
    const slugs = FEDERAL_STATE_OPTIONS.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('Berlin/Brandenburg-Aggregat hat replicate-Liste', () => {
    const bb = FEDERAL_STATE_OPTIONS.find((o) => o.slug === BERLIN_BRANDENBURG_SLUG);
    expect(bb).toBeDefined();
    expect(bb!.replicate).toEqual(['Berlin', 'Brandenburg']);
    expect(bb!.name).toBe(BERLIN_BRANDENBURG_DISPLAY);
  });

  it('alle einzelnen Länder haben leere replicate-Liste', () => {
    for (const o of FEDERAL_STATE_OPTIONS) {
      if (o.slug === BERLIN_BRANDENBURG_SLUG) continue;
      expect(o.replicate).toEqual([]);
    }
  });
});

describe('findStateOption', () => {
  it('findet bayern', () => {
    const o = findStateOption('bayern');
    expect(o?.name).toBe('Bayern');
  });

  it('findet berlin_brandenburg', () => {
    const o = findStateOption(BERLIN_BRANDENBURG_SLUG);
    expect(o?.name).toBe(BERLIN_BRANDENBURG_DISPLAY);
  });

  it('liefert undefined bei unbekanntem Slug', () => {
    expect(findStateOption('foo')).toBeUndefined();
  });
});

describe('DOCUMENT_TYPE_OPTIONS', () => {
  it('hat erwartete Werte', () => {
    const values = DOCUMENT_TYPE_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['rlp_kompakt', 'teil_a', 'teil_b', 'teil_c_subject', 'other']);
  });

  it('alle haben Label', () => {
    for (const o of DOCUMENT_TYPE_OPTIONS) {
      expect(o.label).toBeTruthy();
    }
  });
});
