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

  it('loads chart.umd when chartjs is requested', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '<canvas id="c"></canvas>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      usedLibraries: ['chartjs'],
    });
    expect(doc).toContain('/board-libs/chart.umd.min.js');
  });
});
