"""Deterministisches Zusammensetzen einer Multi-Slide-Bühne.

Output-Form (kompatibel zum bestehenden Sandbox-Pipeline):
    {
        'html': '<div class="free-board ...">…</div>',
        'css':  '… einmal pro genutztem Block-Typ + Slide-Controller …',
        'javascript': '… IIFE pro Block + Slide-Controller …',
        'used_libraries': [...],
        'used_assets': [],
        'used_datasets': [],
        'teacher_notes': '',
        'usage_instructions': [],
        'warnings': [],
        'title': '...',
        'description': '...',
    }

Layout pro Seite: einfaches CSS-Grid, das sich nach der Anzahl der Bausteine
richtet (1, 2, 3, oder 4 Bausteine; size_weight steuert col-span/row-span).
Touch-Steuerung unten (Pfeile + Punkte), zusätzlich Tastatur (← / →).
"""
from __future__ import annotations

from typing import Any

from ._helpers import esc, js_str
from .registry import BLOCK_BY_ID
from .themes import Theme, resolve_theme, theme_to_css_vars
from .validators import CompositionSpec


def _grid_classes(blocks: list) -> tuple[str, list[str]]:
    """Liefert die Grid-Variant-Klasse + per-Block-Klassen für size_weight."""
    n = len(blocks)
    grid_class = f'bb-slide__grid--n{min(n, 4)}'
    cls_per: list[str] = []
    for blk in blocks:
        defn = BLOCK_BY_ID.get(blk.block_id)
        if defn is None:
            cls_per.append('')
            continue
        cls_per.append(f'bb-slide__cell--w{defn.size_weight}')
    return grid_class, cls_per


def _layout_css() -> str:
    return '''
.free-board.bb-board { color: var(--bb-text); background: var(--bb-bg); font-family: var(--bb-font-family); }
.bb-stage { width: 100%; height: 100%; display: grid; grid-template-rows: auto 1fr auto; gap: var(--bb-gap-md); padding: var(--bb-gap-md); box-sizing: border-box; }
.bb-stage__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--bb-gap-md); }
.bb-stage__title { margin: 0; font-size: var(--bb-font-size-2xl); color: var(--bb-text); }
.bb-stage__sub   { margin: 0; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); }
.bb-stage__slides { position: relative; min-height: 0; }
.bb-slide { position: absolute; inset: 0; display: flex; flex-direction: column; gap: var(--bb-gap-sm); opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.bb-slide[data-active="true"] { opacity: 1; pointer-events: auto; }
.bb-slide__title { margin: 0; font-size: var(--bb-font-size-xl); color: var(--bb-text); }
.bb-slide__transition { margin: 0; font-size: var(--bb-font-size-sm); color: var(--bb-text-muted); }
.bb-slide__grid { display: grid; gap: var(--bb-gap-sm); flex: 1 1 auto; min-height: 0; }
.bb-slide__grid--n1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
.bb-slide__grid--n2 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
.bb-slide__grid--n3 { grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr; }
.bb-slide__grid--n4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.bb-slide__cell { min-width: 0; min-height: 0; display: flex; }
.bb-slide__cell > .bb-block { flex: 1 1 auto; min-width: 0; min-height: 0; }
.bb-slide__cell--w3 { grid-column: 1 / -1; }
.bb-slide__grid--n4 .bb-slide__cell--w3 { grid-column: 1 / -1; grid-row: span 1; }
.bb-stage__nav { display: flex; align-items: center; justify-content: space-between; gap: var(--bb-gap-sm); }
.bb-btn { min-height: var(--bb-touch-min); min-width: 64px; padding: 0 var(--bb-gap-md); border-radius: var(--bb-radius-sm); border: 0; cursor: pointer; font-size: var(--bb-font-size-md); }
.bb-btn--primary { background: var(--bb-primary); color: var(--bb-primary-text); }
.bb-btn--ghost   { background: var(--bb-bg-chip); color: var(--bb-text); }
.bb-btn:focus-visible { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
.bb-dots { display: inline-flex; gap: 8px; }
.bb-dots__dot { width: 16px; height: 16px; border-radius: 999px; background: var(--bb-bg-chip); border: 0; cursor: pointer; padding: 0; min-height: 0; }
.bb-dots__dot[data-active="true"] { background: var(--bb-primary); }
.bb-dots__dot:focus-visible { outline: 3px solid var(--bb-focus); outline-offset: 2px; }
'''


def _slide_controller_js(slide_count: int) -> str:
    return '''
(function(){
  var slides = document.querySelectorAll('.bb-slide');
  var dots   = document.querySelectorAll('.bb-dots__dot');
  var prev   = document.querySelector('[data-bb-stage-prev]');
  var next   = document.querySelector('[data-bb-stage-next]');
  var prog   = document.querySelector('[data-bb-stage-progress]');
  var total  = ''' + str(int(slide_count)) + ''';
  var idx    = 0;
  function show(i){
    if (i < 0) i = 0;
    if (i > total - 1) i = total - 1;
    idx = i;
    Array.prototype.forEach.call(slides, function(s, k){ s.setAttribute('data-active', k === idx ? 'true' : 'false'); });
    Array.prototype.forEach.call(dots,   function(d, k){ d.setAttribute('data-active', k === idx ? 'true' : 'false'); d.setAttribute('aria-current', k === idx ? 'page' : 'false'); });
    if (prev) prev.disabled = idx === 0;
    if (next) next.disabled = idx === total - 1;
    if (prog) prog.textContent = (idx + 1) + ' / ' + total;
  }
  if (prev) prev.addEventListener('click', function(){ show(idx - 1); });
  if (next) next.addEventListener('click', function(){ show(idx + 1); });
  Array.prototype.forEach.call(dots, function(d, i){ d.addEventListener('click', function(){ show(i); }); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowLeft')  { show(idx - 1); }
    if (e.key === 'ArrowRight') { show(idx + 1); }
  });
  show(0);
})();
'''


def compose_board(spec: CompositionSpec, theme: Theme | None = None) -> dict[str, Any]:
    chosen = theme if theme is not None else resolve_theme(spec.theme_id)
    css_blocks: dict[str, str] = {}
    js_chunks: list[str] = []
    used_libraries: set[str] = set()
    used_assets: set[str] = set()
    used_datasets: set[str] = set()

    slides_html: list[str] = []
    dots_html: list[str] = []

    for s_idx, page in enumerate(spec.pages):
        grid_class, per_cell_classes = _grid_classes(page.blocks)
        cells_html: list[str] = []
        for cell_class, blk in zip(per_cell_classes, page.blocks):
            defn = BLOCK_BY_ID[blk.block_id]
            content_obj = defn.content_schema.model_validate(blk.content)
            rendered = defn.render(content_obj, chosen)
            cells_html.append(
                '<div class="bb-slide__cell ' + cell_class + '">' + rendered['html'] + '</div>'
            )
            css_blocks.setdefault(blk.block_id, rendered.get('css', ''))
            if rendered.get('js'):
                js_chunks.append(rendered['js'])
            for lib in rendered.get('used_libraries', []):
                used_libraries.add(lib)
            for a in rendered.get('used_assets', []):
                used_assets.add(a)
            for d in rendered.get('used_datasets', []):
                used_datasets.add(d)
        active_attr = 'true' if s_idx == 0 else 'false'
        page_title_html = (
            '<h2 class="bb-slide__title">' + esc(page.title) + '</h2>'
        ) if page.title else ''
        slides_html.append(
            '<section class="bb-slide" data-bb-slide="' + str(s_idx) + '" data-active="' + active_attr + '">'
            + page_title_html
            + '<div class="bb-slide__grid ' + grid_class + '">' + ''.join(cells_html) + '</div>'
            + '</section>'
        )
        dots_html.append(
            '<button type="button" class="bb-dots__dot" data-bb-stage-dot="' + str(s_idx)
            + '" aria-label="Seite ' + str(s_idx + 1) + '"></button>'
        )

    head_subtitle = (
        '<p class="bb-stage__sub">' + esc(spec.description) + '</p>'
    ) if spec.description else ''
    title_text = esc(spec.title or spec.topic or 'Board')
    title_html = (
        '<header class="bb-stage__head">'
        '<div>'
        '<h1 class="bb-stage__title">' + title_text + '</h1>'
        + head_subtitle
        + '</div>'
        '<div class="bb-stage__progress" data-bb-stage-progress aria-live="polite">1 / '
        + str(len(spec.pages)) + '</div>'
        '</header>'
    )

    nav_html = (
        '<nav class="bb-stage__nav" aria-label="Seitennavigation">'
        '<button type="button" class="bb-btn bb-btn--ghost" data-bb-stage-prev>‹ Zurück</button>'
        '<div class="bb-dots" role="tablist">' + ''.join(dots_html) + '</div>'
        '<button type="button" class="bb-btn bb-btn--primary" data-bb-stage-next>Weiter ›</button>'
        '</nav>'
    )

    html = (
        '<div class="free-board bb-board">'
        '<div class="bb-stage">'
        + title_html
        + '<div class="bb-stage__slides">' + ''.join(slides_html) + '</div>'
        + nav_html
        + '</div>'
        '</div>'
    )

    css_root = f':root, .free-board {{\n  {theme_to_css_vars(chosen)}\n}}\n'
    css = css_root + _layout_css() + '\n'.join(css_blocks.values())
    javascript = _slide_controller_js(len(spec.pages)) + '\n' + '\n'.join(js_chunks)

    return {
        'html': html,
        'css': css,
        'javascript': javascript,
        'used_libraries': sorted(used_libraries),
        'used_assets': sorted(used_assets),
        'used_datasets': sorted(used_datasets),
        'teacher_notes': '',
        'usage_instructions': [],
        'warnings': [],
        'title': (spec.title or spec.topic or 'Board')[:255],
        'description': spec.description[:5000],
    }
