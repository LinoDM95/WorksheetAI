import { describe, expect, it } from 'vitest';
import { formatFullBoardClipboardBundle } from './BoardCodeEditorModal';

describe('formatFullBoardClipboardBundle', () => {
  it('fügt HTML, CSS und JavaScript in einem String mit Markern zusammen', () => {
    const out = formatFullBoardClipboardBundle('<div>x</div>', 'body{}', 'init();');
    expect(out).toContain('=== HTML ===');
    expect(out).toContain('<div>x</div>');
    expect(out).toContain('=== CSS ===');
    expect(out).toContain('body{}');
    expect(out).toContain('=== JAVASCRIPT ===');
    expect(out).toContain('init();');
  });
});
