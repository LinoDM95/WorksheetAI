/**
 * Automatisiert die Plan-Schritte „iframe-DOM“ + „Netzwerk-Gerüst“:
 * API-Payload → buildFreeHtmlSrcDoc → parsbares Dokument mit #board-root und /board-libs-Skripten.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildFreeHtmlSrcDoc } from './buildFreeHtmlSrcDoc';

const parseBoardSrcDoc = (srcDoc: string) => {
  const dom = new JSDOM(srcDoc, { url: 'http://localhost/' });
  const root = dom.window.document.querySelector('#board-root');
  const scriptSrcs = [...dom.window.document.querySelectorAll('script[src]')].map((s) =>
    s.getAttribute('src'),
  );
  return { doc: dom.window.document, root, scriptSrcs };
};

describe('Board iframe srcDoc (DOM-Repro)', () => {
  it('legt API-html unverändert in #board-root — bei leerem html bleibt board-root leer (weiße Fläche)', () => {
    const marker = '<div class="free-board" data-test="p">Inhalt</div>';
    const filled = buildFreeHtmlSrcDoc({
      html: marker,
      css: 'body{margin:0}',
      javascript: '',
      scriptsEnabled: false,
      documentBaseHref: 'http://127.0.0.1:5173/',
    });
    const { root: r1 } = parseBoardSrcDoc(filled);
    expect(r1?.innerHTML).toContain(marker);

    const empty = buildFreeHtmlSrcDoc({
      html: '',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      documentBaseHref: 'http://127.0.0.1:5173/',
    });
    const { root: r2, doc } = parseBoardSrcDoc(empty);
    expect((r2?.innerHTML || '').trim()).toBe('');
    expect(doc.body.innerHTML).toContain('id="board-root"');
    expect(empty).toMatch(/background:\s*#ffffff/i);
  });

  it('bindet /board-libs-Skripte für Network-Loads (d3, roughjs)', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '<div>x</div>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
      documentBaseHref: 'http://127.0.0.1:5173/',
    });
    const { scriptSrcs } = parseBoardSrcDoc(doc);
    expect(scriptSrcs.some((s) => s?.includes('/board-libs/d3.min.js'))).toBe(true);
    expect(scriptSrcs.some((s) => s?.includes('/board-libs/rough.min.js'))).toBe(true);
  });

  it('installiert error und unhandledrejection Listener (Konsole/Overlay-Verhalten)', () => {
    const doc = buildFreeHtmlSrcDoc({
      html: '',
      css: '',
      javascript: '',
      scriptsEnabled: false,
    });
    expect(doc).toContain("addEventListener('error'");
    expect(doc).toContain("addEventListener('unhandledrejection'");
    expect(doc).toContain('boardAppendScriptErrorOverlay');
  });

  it('Kette #wa-viewport → #wa-clip → #wa-scale-inner → #board-root für Stage-Fit', () => {
    const src = buildFreeHtmlSrcDoc({
      html: '<span id="t">hi</span>',
      css: '',
      javascript: '',
      scriptsEnabled: false,
    });
    const { doc } = parseBoardSrcDoc(src);
    const viewport = doc.querySelector('#wa-viewport');
    const clip = viewport?.querySelector('#wa-clip');
    const scale = clip?.querySelector('#wa-scale-inner');
    const board = scale?.querySelector('#board-root');
    expect(board?.querySelector('#t')?.textContent).toBe('hi');
  });
});
