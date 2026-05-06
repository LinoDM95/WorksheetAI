import { describe, expect, it } from 'vitest';

import { STAGE_BASE_H, STAGE_BASE_W } from '../../boardStageLayout';
import { buildFreeHtmlSrcDoc } from './buildFreeHtmlSrcDoc';

describe('buildFreeHtmlSrcDoc', () => {
  it('embeds user html inside #board-root and fixed stage dimensions', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '<div class="free-board">X</div>',
      css: '.free-board { color: red; }',
      javascript: 'console.log(1);',
      scriptsEnabled: true,
      usedLibraries: [],
    });
    expect(doc).toContain('id="board-root"');
    expect(doc).toContain('<div class="free-board">X</div>');
    expect(doc).toContain(`${STAGE_BASE_W}px`);
    expect(doc).toContain(`${STAGE_BASE_H}px`);
  });

  it('escapes closing style and script sequences in user css/js', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '',
      css: 'body { content: "</style>"; }',
      javascript: 'var s = "</script>";',
      scriptsEnabled: true,
    });
    expect(doc).toContain('body { content: "<\\/style>"; }');
    expect(doc).toContain('var s = "<\\/script>";');
  });

  it('injects base href only for safe http(s) URLs', () => {
    const withGood = buildFreeHtmlSrcDoc({
      html: '',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      documentBaseHref: 'http://127.0.0.1:5173/',
    });
    expect(withGood).toContain('<base href="http://127.0.0.1:5173/"');

    const withBad = buildFreeHtmlSrcDoc({
      html: '',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      documentBaseHref: 'javascript:alert(1)',
    });
    expect(withBad).not.toContain('<base');
  });

  it('always includes d3 and roughjs script tags', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '',
      css: '',
      javascript: '',
      scriptsEnabled: false,
    });
    expect(doc).toContain('/board-libs/d3.min.js');
    expect(doc).toContain('/board-libs/rough.min.js');
  });

  it('includes leaflet css when leaflet library requested', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      usedLibraries: ['leaflet'],
    });
    expect(doc).toContain('leaflet.css');
  });

  it('loads optional physics and animation libs and orders script tags stably', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      usedLibraries: ['howler', 'matterjs', 'gsap', 'interactjs', 'confetti', 'konva'],
    });
    expect(doc).toContain('/board-libs/gsap.min.js');
    expect(doc).toContain('/board-libs/matter.min.js');
    expect(doc).toContain('/board-libs/interact.min.js');
    expect(doc).toContain('/board-libs/confetti.browser.js');
    expect(doc).toContain('/board-libs/howler.min.js');
    expect(doc).toContain('/board-libs/konva.min.js');
    const gi = doc.indexOf('gsap.min.js');
    const mi = doc.indexOf('matter.min.js');
    const ii = doc.indexOf('interact.min.js');
    expect(gi).toBeGreaterThan(-1);
    expect(mi).toBeGreaterThan(gi);
    expect(ii).toBeGreaterThan(mi);
  });

  it('injects frozen preview css when frozenPreview is set', () => {
    const off = buildFreeHtmlSrcDoc({
      html: '<div>x</div>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      frozenPreview: false,
    });
    expect(off).not.toContain('Frozen library thumbnail');

    const on = buildFreeHtmlSrcDoc({
      html: '<div>x</div>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      frozenPreview: true,
    });
    expect(on).toContain('Frozen library thumbnail');
    expect(on).toContain('animation: none !important');
    expect(on).toContain('wa-frozen-thumb');
    expect(on).toContain('2200');
  });

  it('injects touch-friendly base css (min 56px, touch-action manipulation)', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '<div class="free-board"><button>X</button></div>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
    });
    expect(doc).toContain('touch-action: manipulation');
    expect(doc).toContain('min-width: 56px');
    expect(doc).toContain('min-height: 56px');
    expect(doc).toContain('overscroll-behavior: none');
  });

  it('marks draggable elements with touch-action: none', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '<div class="free-board"><div class="draggable">D</div></div>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
    });
    expect(doc).toContain('.free-board .draggable');
    expect(doc).toContain('touch-action: none');
  });

  it('emits CSP meta with permissive img-src to allow generated assets and inline data URIs', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '<div class="free-board"><img src="/board-generated-assets/abc.svg"/></div>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
    });
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toMatch(/img-src 'self' data:/);
  });
});
