/**
 * Erzeugt das HTML-Dokument für den Sandbox-iframe.
 *
 * Reihenfolge im <head>:
 *  1. Reset-/Layout-CSS (Design-Bühne #board-root = feste Pixel, passiert zu allen Viewports)
 *  2. optional Leaflet-CSS, falls 'leaflet' in usedLibraries
 *  3. immer d3 + roughjs; optional chartjs, leaflet, turf, topojson, gsap, konva, matterjs,
 *     interactjs, confetti, howler je nach usedLibraries
 *  4. on-demand topojson, turf, leaflet
 *  5. BOARD_DATASETS-Injection (JSON → globales Objekt)
 *  6. Globaler Error-Handler
 *  7. injected User-CSS (mit </style>-Escape)
 *  8. Body: #wa-viewport → #wa-clip → #wa-scale-inner → #board-root (User-HTML)
 *  9. Sandbox-Bootstrap: einheitlich skalieren (gleiches Verhältnis wie Host `boardStageLayout`)
 * 10. User-JS in IIFE/try-catch (mit </script>-Escape)
 * 11. synthetisches `resize` für Charts/Layouts
 *
 * Wichtig: Der iframe läuft mit `sandbox="allow-scripts"` ohne `allow-same-origin`,
 * d.h. der Skriptkontext sieht keine Cookies/LocalStorage und kann nicht auf das
 * Eltern-DOM zugreifen.
 */
import { STAGE_BASE_H, STAGE_BASE_W } from '../../boardStageLayout';
import type { LibraryId } from '../../types';

const ESCAPE_STYLE_RE = /<\/style/gi;
const ESCAPE_SCRIPT_RE = /<\/script/gi;

const escapeStyleFragment = (css: string): string => (css || '').replace(ESCAPE_STYLE_RE, '<\\/style');
const escapeScriptFragment = (js: string): string => (js || '').replace(ESCAPE_SCRIPT_RE, '<\\/script');

const ALWAYS_LIBRARIES: LibraryId[] = ['d3', 'roughjs'];

const LIBRARY_SCRIPTS: Record<LibraryId, string> = {
  d3: '/board-libs/d3.min.js',
  roughjs: '/board-libs/rough.min.js',
  chartjs: '/board-libs/chart.umd.min.js',
  leaflet: '/board-libs/leaflet.js',
  turf: '/board-libs/turf.min.js',
  topojson: '/board-libs/topojson-client.min.js',
  interactjs: '/board-libs/interact.min.js',
  matterjs: '/board-libs/matter.min.js',
  gsap: '/board-libs/gsap.min.js',
  confetti: '/board-libs/confetti.browser.js',
  howler: '/board-libs/howler.min.js',
  konva: '/board-libs/konva.min.js',
};

/** Reihenfolge der `<script>`-Tags: konsistent zum Backend `free_html_visual_doc`. */
const LIBRARY_SCRIPT_ORDER: LibraryId[] = [
  'd3',
  'roughjs',
  'chartjs',
  'leaflet',
  'topojson',
  'turf',
  'gsap',
  'konva',
  'matterjs',
  'interactjs',
  'confetti',
  'howler',
];

const buildResetCss = (designW: number, designH: number): string => `
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    min-height: 100%;
    overflow: hidden;
    touch-action: manipulation;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0f172a;
    background: #ffffff;
  }
  #wa-viewport {
    width: 100%;
    height: 100%;
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  #wa-clip {
    overflow: hidden;
    flex-shrink: 0;
  }
  #wa-scale-inner {
    transform-origin: top left;
  }
  #board-root {
    width: ${designW}px;
    height: ${designH}px;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    overflow: auto;
    position: relative;
    line-height: normal;
  }
  .free-board {
    width: 100%;
    height: 100%;
    min-height: 100%;
    max-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    overscroll-behavior: none;
  }
  .free-board *, .free-board *::before, .free-board *::after { box-sizing: border-box; }
  .free-board button,
  .free-board input:not([type="hidden"]),
  .free-board select,
  .free-board textarea,
  .free-board [role="button"],
  .free-board [role="tab"],
  .free-board [role="switch"],
  .free-board [role="slider"],
  .free-board .touch-target {
    min-width: 56px;
    min-height: 56px;
    cursor: pointer;
  }
  .free-board .draggable,
  .free-board .drag-item,
  .free-board .interactive-object {
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .free-board .reset-button {
    min-width: 56px;
    min-height: 56px;
  }
  @media (max-width: 900px) {
    .free-board { overflow: auto; }
  }
`;

const boardDatasetsScript = (boardDatasets: Record<string, unknown> | undefined): string => {
  const data = boardDatasets && Object.keys(boardDatasets).length ? boardDatasets : {};
  const json = JSON.stringify(data);
  const safeInner = json.replace(/</g, '\\u003c');
  const jsStringLiteral = JSON.stringify(safeInner);
  return `<script>try{window.BOARD_DATASETS=JSON.parse(${jsStringLiteral});}catch(_){window.BOARD_DATASETS={};}</script>`;
};

const documentBaseTag = (href: string | undefined): string => {
  if (!href) return '';
  const t = href.trim();
  if (!/^https?:\/\//i.test(t)) return '';
  if (/[\s"'<>`]/.test(t)) return '';
  const esc = t.replace(/"/g, '&quot;');
  return `<base href="${esc}" />\n`;
};

/**
 * CSP für den Sandbox-iframe (zusätzlich zur sandbox-Attribut-Restriktion).
 *
 * Wir erlauben Bilder explizit von 'self' + data: + blob: + http(s):,
 * sodass sowohl inline-SVG-Data-URLs als auch URL-basierte generierte Assets
 * (`/board-generated-assets/<uuid>.svg`, geliefert vom Parent-Host) laden können.
 * Skripte/Styles bleiben durch die Sandbox-Restriktion und unsere Sanitize-Pipeline
 * geschützt; CSP soll hier nicht enger sein als nötig, sonst brechen Libraries.
 */
const SRCDOC_CSP_META = `<meta http-equiv="Content-Security-Policy" content="img-src 'self' data: blob: http: https:;" />`;

export type BuildSrcDocOptions = {
  html: string;
  css: string;
  javascript: string;
  scriptsEnabled: boolean;
  usedLibraries?: LibraryId[];
  /** Vom Eltern-Dokument geladen; im iframe als globales Objekt verfügbar. */
  boardDatasets?: Record<string, unknown>;
  /**
   * Absoluter Basis-URL für `/board-assets/`, `/board-libs/` im srcdoc-iframe (opaque origin).
   * Ohne dieses `<base>` lösen manche Browser absolute Pfade im about:srcdoc-Kontext nicht zuverlässig.
   */
  documentBaseHref?: string;
  /**
   * Für Galerie-/Bibliotheks-Vorschau: keine Bewegung (Nutzer sollte scriptsEnabled:false setzen —
   * zusätzlich werden Transition/Animation im #board-root abgeschaltet).
   */
  frozenPreview?: boolean;
};

const dedupe = <T>(arr: T[]): T[] => Array.from(new Set(arr));

const librarySortIndex = (id: LibraryId): number => {
  const i = LIBRARY_SCRIPT_ORDER.indexOf(id);
  return i >= 0 ? i : LIBRARY_SCRIPT_ORDER.length + 99;
};

const libraryScriptTags = (usedLibraries: LibraryId[]): string => {
  const wanted = dedupe<LibraryId>([...ALWAYS_LIBRARIES, ...(usedLibraries || []).filter(Boolean)]).sort(
    (a, b) => librarySortIndex(a) - librarySortIndex(b),
  );
  return wanted
    .map((id) => {
      const src = LIBRARY_SCRIPTS[id];
      if (!src) return '';
      return `<script src="${src}"></script>`;
    })
    .filter(Boolean)
    .join('\n');
};

const optionalLeafletStyle = (usedLibraries: LibraryId[]): string => {
  if (!usedLibraries.includes('leaflet')) return '';
  return '<link rel="stylesheet" href="/board-libs/leaflet.css" />';
};

/** Skaliert die Design-Bühne in den iframe-Viewport; danach Resize-Nudge für Layouts. Immer eingebunden (nicht Nutzer-JS). */
const buildSandboxBootstrap = (baseW: number, baseH: number): string => `
<script>
(function () {
  var W = ${baseW}, H = ${baseH};
  function applyStageFit() {
    var vw = window.innerWidth || document.documentElement.clientWidth || W;
    var vh = window.innerHeight || document.documentElement.clientHeight || H;
    var eps = 2;
    var s;
    if (Math.abs(vw - W) <= eps && Math.abs(vh - H) <= eps) {
      s = 1;
    } else {
      s = Math.min(vw / W, vh / H);
    }
    if (!(s > 0) || !isFinite(s)) s = 1;
    var clip = document.getElementById('wa-clip');
    var inner = document.getElementById('wa-scale-inner');
    if (!clip || !inner) return;
    clip.style.width = W * s + 'px';
    clip.style.height = H * s + 'px';
    inner.style.width = W + 'px';
    inner.style.height = H + 'px';
    inner.style.transform = 'scale(' + s + ')';
    inner.style.transformOrigin = 'top left';
    inner.style.marginRight = -W * (1 - s) + 'px';
    inner.style.marginBottom = -H * (1 - s) + 'px';
  }
  function nudgeResize() {
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (_) {}
  }
  var debounceTimer = null;
  function debouncedNudge() {
    if (debounceTimer != null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      debounceTimer = null;
      nudgeResize();
    }, 48);
  }
  function onFrameChange() {
    applyStageFit();
    debouncedNudge();
  }
  window.addEventListener('resize', onFrameChange);
  var vp = document.getElementById('wa-viewport');
  if (vp && typeof ResizeObserver !== 'undefined') {
    try {
      new ResizeObserver(onFrameChange).observe(vp);
    } catch (_) {}
  }
  applyStageFit();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyStageFit);
  }
  window.addEventListener('load', function () {
    applyStageFit();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(nudgeResize);
    });
  });
  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () {
      applyStageFit();
      nudgeResize();
    });
  });
  window.setTimeout(function () { applyStageFit(); nudgeResize(); }, 120);
  window.setTimeout(function () { applyStageFit(); nudgeResize(); }, 400);
})();
<\/script>
`;

const FROZEN_PREVIEW_CSS = `
  /* Frozen library thumbnail: keine laufenden Animationen/Transitions im Inhalt */
  #board-root, #board-root * {
    animation: none !important;
    animation-name: none !important;
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-property: none !important;
    transition-duration: 0s !important;
    caret-color: transparent !important;
  }
`;

const errorOverlayScript = `
  window.addEventListener('error', function (event) {
    try {
      var msg = event && event.message ? event.message : String(event);
      var line = event && event.lineno != null ? ' (Zeile ' + event.lineno + ')' : '';
      var pre = document.createElement('pre');
      pre.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;max-height:30%;overflow:auto;background:#fee2e2;color:#7f1d1d;padding:10px 14px;font-size:12px;line-height:1.4;z-index:2147483647;border-top:1px solid #fecaca;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;');
      pre.textContent = 'Skriptfehler: ' + msg + line;
      document.body.appendChild(pre);
    } catch (_) { /* swallow */ }
  });
`;

export function buildFreeHtmlSrcDoc(opts: BuildSrcDocOptions): string {
  const {
    html,
    css,
    javascript,
    scriptsEnabled,
    usedLibraries = [],
    boardDatasets,
    documentBaseHref,
    frozenPreview,
  } = opts;
  const safeCss = escapeStyleFragment(css || '');
  const userJs = scriptsEnabled ? escapeScriptFragment(javascript || '') : '';
  const libsHtml = libraryScriptTags(usedLibraries);
  const leafletCss = optionalLeafletStyle(usedLibraries);
  const datasetsHtml = boardDatasetsScript(boardDatasets);
  const baseTag = documentBaseTag(documentBaseHref);
  const resetCss = buildResetCss(STAGE_BASE_W, STAGE_BASE_H);
  const frozenBlock = frozenPreview ? `\n${FROZEN_PREVIEW_CSS}\n` : '';
  const sandboxBootstrapHtml = buildSandboxBootstrap(STAGE_BASE_W, STAGE_BASE_H);

  const userScriptBlock = scriptsEnabled
    ? `
    try {
      (function () {
        'use strict';
        ${userJs}
      })();
    } catch (err) {
      try {
        var pre = document.createElement('pre');
        pre.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;max-height:30%;overflow:auto;background:#fee2e2;color:#7f1d1d;padding:10px 14px;font-size:12px;line-height:1.4;z-index:2147483647;border-top:1px solid #fecaca;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;');
        pre.textContent = 'Skriptfehler: ' + String(err && err.message || err);
        document.body.appendChild(pre);
      } catch (_) { /* swallow */ }
    }
  `
    : '/* Skripte deaktiviert */';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${SRCDOC_CSP_META}
${baseTag}${leafletCss}
<style>
${resetCss}
${safeCss}
${frozenBlock}
</style>
${libsHtml}
${datasetsHtml}
<script>
${errorOverlayScript}
</script>
</head>
<body>
<div id="wa-viewport">
  <div id="wa-clip">
    <div id="wa-scale-inner">
      <div id="board-root">${html || ''}</div>
    </div>
  </div>
</div>
${sandboxBootstrapHtml}
<script>
${userScriptBlock}
</script>
</body>
</html>`;
}
