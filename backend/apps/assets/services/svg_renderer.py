"""SVG-zu-PNG-Renderer.

Bevorzugt Playwright (synchron) — fällt automatisch auf CairoSVG zurück, falls
Playwright nicht installiert ist. Wenn beides fehlt, gibt der Renderer einen
Skip-mit-Warning-Status zurück (kein Crash).

Aufruf::

    result = render_preview(svg_text, width=512, height=512)
    if result['ok']:
        png_bytes = result['png']
"""

from __future__ import annotations

import base64
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _render_with_playwright(svg: str, width: int, height: int) -> bytes | None:
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001
        return None

    html = (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<style>html,body{margin:0;padding:0;background:transparent;}'
        f'svg{{display:block;width:{width}px;height:{height}px;}}'
        '</style></head><body>' + svg + '</body></html>'
    )
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(viewport={'width': width, 'height': height})
            page = context.new_page()
            page.set_content(html, wait_until='load')
            png = page.screenshot(omit_background=True, full_page=False, type='png')
            context.close()
            browser.close()
            return png
    except Exception:  # noqa: BLE001
        logger.exception('SVG-Renderer: Playwright fehlgeschlagen')
        return None


def _render_with_cairosvg(svg: str, width: int, height: int) -> bytes | None:
    try:
        import cairosvg  # type: ignore[import-not-found]
    except Exception:  # noqa: BLE001
        return None
    try:
        return cairosvg.svg2png(  # type: ignore[no-any-return]
            bytestring=svg.encode('utf-8'),
            output_width=width,
            output_height=height,
        )
    except Exception:  # noqa: BLE001
        logger.exception('SVG-Renderer: CairoSVG fehlgeschlagen')
        return None


def render_preview(svg: str, *, width: int = 512, height: int = 512) -> dict[str, Any]:
    """Rendert ``svg`` zu PNG-Bytes.

    Liefert ``{ok: True, png: bytes, engine: 'playwright'|'cairosvg'}`` oder
    ``{ok: False, warning: str}`` (skipt sauber, kein Crash).
    """

    body = (svg or '').strip()
    if not body:
        return {'ok': False, 'warning': 'empty_svg'}
    png = _render_with_playwright(body, width, height)
    if png:
        return {'ok': True, 'png': png, 'engine': 'playwright'}
    png = _render_with_cairosvg(body, width, height)
    if png:
        return {'ok': True, 'png': png, 'engine': 'cairosvg'}
    return {'ok': False, 'warning': 'renderer_unavailable'}


def render_preview_data_url(svg: str, *, width: int = 512, height: int = 512) -> str | None:
    """Bequeme Variante: liefert PNG als Data-URL oder ``None`` bei Skip."""
    result = render_preview(svg, width=width, height=height)
    if not result.get('ok'):
        return None
    return 'data:image/png;base64,' + base64.b64encode(result['png']).decode('ascii')
