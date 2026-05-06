import { describe, expect, it } from 'vitest';

import { REVISION_MODE_OPTIONS } from './RevisionModeSelect';
import { REVISION_QUICK_ACTIONS } from './RevisionQuickActions';
import type { RevisionMode } from '../../types';

describe('Smartboard Revision Modi & Quick Actions', () => {
  it('bietet alle 8 Revisionsmodi gemäß Spezifikation', () => {
    const expected: RevisionMode[] = [
      'general',
      'bug_fix',
      'design_improve',
      'touch_optimize',
      'content_change',
      'simplify',
      'make_more_creative',
      'performance_improve',
    ];
    expect(REVISION_MODE_OPTIONS.map((o) => o.value)).toEqual(expected);
    for (const opt of REVISION_MODE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.hint.length).toBeGreaterThan(0);
    }
  });

  it('jede Quick-Action verweist auf einen gültigen Revisionsmodus', () => {
    const validModes = new Set(REVISION_MODE_OPTIONS.map((o) => o.value));
    for (const action of REVISION_QUICK_ACTIONS) {
      expect(validModes.has(action.mode)).toBe(true);
      expect(action.prompt.length).toBeGreaterThan(0);
      expect(action.label.length).toBeGreaterThan(0);
    }
  });

  it('enthält Fehlerbehebung, Touch-Optimierung und Designverbesserung als Schnellauswahl', () => {
    const modes = REVISION_QUICK_ACTIONS.map((a) => a.mode);
    expect(modes).toContain('bug_fix');
    expect(modes).toContain('touch_optimize');
    expect(modes).toContain('design_improve');
  });
});
