import { describe, expect, it } from 'vitest';

import { revisionVLabel } from './revisionVLabel';

describe('revisionVLabel', () => {
  it('gibt V<n> für die neueste Revision aus', () => {
    expect(revisionVLabel(0, 1)).toBe('V1');
    expect(revisionVLabel(0, 5)).toBe('V5');
  });

  it('zählt von neueste -> älteste runter', () => {
    expect(revisionVLabel(0, 3)).toBe('V3');
    expect(revisionVLabel(1, 3)).toBe('V2');
    expect(revisionVLabel(2, 3)).toBe('V1');
  });

  it('ist stabil bei einzelner Revision', () => {
    expect(revisionVLabel(0, 1)).toBe('V1');
  });
});
