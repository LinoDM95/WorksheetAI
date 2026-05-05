"""Baut das vollständige HTML-Dokument für die Headless-Visuelle QA (wie Frontend ``buildFreeHtmlSrcDoc``)."""
from __future__ import annotations

import json
import re
from typing import Any

STAGE_BASE_W = 1280
STAGE_BASE_H = 720

_ALWAYS_LIBS = ('d3', 'roughjs')
_LIBRARY_SCRIPTS: dict[str, str] = {
    'd3': '/board-libs/d3.min.js',
    'roughjs': '/board-libs/rough.min.js',
    'chartjs': '/board-libs/chart.umd.min.js',
    'leaflet': '/board-libs/leaflet.js',
    'turf': '/board-libs/turf.min.js',
    'topojson': '/board-libs/topojson-client.min.js',
}

_ESCAPE_STYLE_RE = re.compile(r'</style', re.IGNORECASE)
_ESCAPE_SCRIPT_RE = re.compile(r'</script', re.IGNORECASE)


def _escape_style_fragment(css: str) -> str:
    return _ESCAPE_STYLE_RE.sub(r'<\\/style', css or '')


def _escape_script_fragment(js: str) -> str:
    return _ESCAPE_SCRIPT_RE.sub(r'<\\/script', js or '')


def _dedupe(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _library_script_tags(used_libraries: list[str]) -> str:
    wanted = _dedupe([*_ALWAYS_LIBS, *[str(x).strip() for x in (used_libraries or []) if x]])
    lines: list[str] = []
    for lid in wanted:
        src = _LIBRARY_SCRIPTS.get(lid)
        if src:
            lines.append(f'<script src="{src}"></script>')
    return '\n'.join(lines)


def _optional_leaflet_style(used_libraries: list[str]) -> str:
    if 'leaflet' in used_libraries:
        return '<link rel="stylesheet" href="/board-libs/leaflet.css" />'
    return ''


def _board_datasets_script(board_datasets: dict[str, Any] | None) -> str:
    data = board_datasets if board_datasets else {}
    json_str = json.dumps(data, ensure_ascii=False)
    safe_inner = json_str.replace('<', '\\u003c')
    js_literal = json.dumps(safe_inner, ensure_ascii=False)
    return (
        '<script>try{window.BOARD_DATASETS=JSON.parse('
        + js_literal
        + ');}catch(_){window.BOARD_DATASETS={};}</script>'
    )


def _document_base_tag(href: str | None) -> str:
    if not href:
        return ''
    t = href.strip()
    if not re.match(r'^https?://', t, re.IGNORECASE):
        return ''
    if re.search(r'[\s"\'<>`]', t):
        return ''
    esc = t.replace('"', '&quot;')
    return f'<base href="{esc}" />\n'


def _build_reset_css(design_w: int, design_h: int) -> str:
    return f"""
  html, body {{
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
  }}
  #wa-viewport {{
    width: 100%;
    height: 100%;
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }}
  #wa-clip {{
    overflow: hidden;
    flex-shrink: 0;
  }}
  #wa-scale-inner {{
    transform-origin: top left;
  }}
  #board-root {{
    width: {design_w}px;
    height: {design_h}px;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    overflow: auto;
    position: relative;
    line-height: normal;
  }}
  .free-board {{
    width: 100%;
    height: 100%;
    min-height: 100%;
    max-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }}
  .free-board *, .free-board *::before, .free-board *::after {{ box-sizing: border-box; }}
""".strip()


def _build_sandbox_bootstrap(base_w: int, base_h: int) -> str:
    return f"""
<script>
(function () {{
  var W = {base_w}, H = {base_h};
  function applyStageFit() {{
    var vw = window.innerWidth || document.documentElement.clientWidth || W;
    var vh = window.innerHeight || document.documentElement.clientHeight || H;
    var eps = 2;
    var s;
    if (Math.abs(vw - W) <= eps && Math.abs(vh - H) <= eps) {{
      s = 1;
    }} else {{
      s = Math.min(vw / W, vh / H);
    }}
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
  }}
  function nudgeResize() {{
    try {{
      window.dispatchEvent(new Event('resize'));
    }} catch (_) {{}}
  }}
  var debounceTimer = null;
  function debouncedNudge() {{
    if (debounceTimer != null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {{
      debounceTimer = null;
      nudgeResize();
    }}, 48);
  }}
  function onFrameChange() {{
    applyStageFit();
    debouncedNudge();
  }}
  window.addEventListener('resize', onFrameChange);
  var vp = document.getElementById('wa-viewport');
  if (vp && typeof ResizeObserver !== 'undefined') {{
    try {{
      new ResizeObserver(onFrameChange).observe(vp);
    }} catch (_) {{}}
  }}
  applyStageFit();
  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', applyStageFit);
  }}
  window.addEventListener('load', function () {{
    applyStageFit();
    window.requestAnimationFrame(function () {{
      window.requestAnimationFrame(nudgeResize);
    }});
  }});
  window.requestAnimationFrame(function () {{
    window.requestAnimationFrame(function () {{
      applyStageFit();
      nudgeResize();
    }});
  }});
  window.setTimeout(function () {{ applyStageFit(); nudgeResize(); }}, 120);
  window.setTimeout(function () {{ applyStageFit(); nudgeResize(); }}, 400);
}})();
</script>
""".strip()


_ERROR_OVERLAY_SCRIPT = """
  window.addEventListener('error', function (event) {
    try {
      var msg = event && event.message ? event.message : String(event);
      var line = event && event.lineno != null ? ' (Zeile ' + event.lineno + ')' : '';
      var pre = document.createElement('pre');
      pre.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;max-height:30%;overflow:auto;background:#fee2e2;color:#7f1d1d;padding:10px 14px;font-size:12px;line-height:1.4;z-index:2147483647;border-top:1px solid #fecaca;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;');
      pre.textContent = 'Skriptfehler: ' + msg + line;
      document.body.appendChild(pre);
    } catch (_) { }
  });
"""


def build_visual_qa_document(
    *,
    html: str,
    css: str,
    javascript: str,
    used_libraries: list[str],
    board_datasets: dict[str, Any] | None,
    document_base_href: str,
    scripts_enabled: bool = True,
) -> str:
    """Volles HTML wie ``buildFreeHtmlSrcDoc`` (Skripte standardmäßig an)."""
    safe_css = _escape_style_fragment(css or '')
    user_js = _escape_script_fragment(javascript or '') if scripts_enabled else ''
    libs_html = _library_script_tags(used_libraries)
    leaflet_css = _optional_leaflet_style(used_libraries)
    datasets_html = _board_datasets_script(board_datasets)
    base_tag = _document_base_tag(document_base_href)
    reset_css = _build_reset_css(STAGE_BASE_W, STAGE_BASE_H)
    bootstrap = _build_sandbox_bootstrap(STAGE_BASE_W, STAGE_BASE_H)

    if scripts_enabled:
        user_script_block = (
            """
    try {
      (function () {
        'use strict';
        """
            + user_js
            + """
      })();
    } catch (err) {
      try {
        var pre = document.createElement('pre');
        pre.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;max-height:30%;overflow:auto;background:#fee2e2;color:#7f1d1d;padding:10px 14px;font-size:12px;line-height:1.4;z-index:2147483647;border-top:1px solid #fecaca;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;');
        pre.textContent = 'Skriptfehler: ' + String(err && err.message ? err.message : err);
        document.body.appendChild(pre);
      } catch (_) { }
    }
  """
        )
    else:
        user_script_block = '/* Skripte deaktiviert */'

    frag = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
{base_tag}{leaflet_css}
<style>
{reset_css}
{safe_css}
</style>
{libs_html}
{datasets_html}
<script>
{_ERROR_OVERLAY_SCRIPT}
</script>
</head>
<body>
<div id="wa-viewport">
  <div id="wa-clip">
    <div id="wa-scale-inner">
      <div id="board-root">{html or ''}</div>
    </div>
  </div>
</div>
{bootstrap}
<script>
{user_script_block}
</script>
</body>
</html>"""
    return frag
