"""Kreativ-Modus: KI liefert pro A4-Seite HTML/CSS-Fragmente (kein Block-JSON, kein LaTeX)."""
from __future__ import annotations

import re
from typing import Any

from apps.boards.services.free_html_sanitize import sanitize_css, sanitize_html_fragment

from .creative_html_reflow import apply_creative_reflow_if_needed
from .page import normalize_page_setup

RENDER_KIND_CREATIVE_HTML = 'html-a4-creative-v1'


# Selektoren, bei denen ein Hintergrund die ganze Druckseite einfärben würde.
# Wir wollen, dass das Arbeitsblatt **papierweiß** bleibt — Akzente nur in einzelnen
# Aufgabenkästen / Infoboxen, nicht auf der Wurzel.
_PAGE_ROOT_BG_SELECTOR_RE = re.compile(
    r'^\s*(?:'
    r'\.ws-creative-page-inner'
    r'|html'
    r'|body'
    r'|:root'
    r'|\*'
    r'|html\s*,\s*body'
    r'|body\s*,\s*html'
    r')\s*$',
    re.IGNORECASE,
)
# Properties, die wir aus dem Output entfernen: Schatten und Wurzel-Hintergrund.
_BG_PROP_RE = re.compile(
    r'(?:^|;)\s*background(?:-color|-image|-attachment|-size|-position|-repeat|-clip|-origin)?\s*:[^;}]*',
    re.IGNORECASE,
)
_SHADOW_PROP_RE = re.compile(
    r'(?:^|;)\s*(?:box|text)-shadow\s*:[^;}]*',
    re.IGNORECASE,
)
# Eine sehr grobe CSS-Regel: ``selector { body }``. Reicht für die flachen page_css-Snippets.
_CSS_RULE_RE = re.compile(r'([^{}]+)\{([^{}]*)\}', re.DOTALL)


def _strip_creative_css_decorations(css: str) -> tuple[str, list[str]]:
    """Entfernt Seiten-Hintergründe und Schatten aus dem KI-CSS.

    Behebt typische Web-UI-Anmutungen, die die Druckseite verfälschen:
    - ``.ws-creative-page-inner { background: … }`` (oder ``body``/``html``/``:root``):
      würde die ganze A4-Fläche einfärben.
    - ``box-shadow`` / ``text-shadow``: lassen das Blatt wie ein Webdesign wirken.

    Akzentflächen auf einzelnen Aufgabenkästen (z. B. ``.ws-creative-page-inner .info { background: … }``)
    bleiben **erlaubt** — nur die Wurzel wird gesäubert.
    """
    if not css or not css.strip():
        return css, []
    notes: list[str] = []
    bg_root_strips = 0
    shadow_strips = 0

    def _process_rule(match: re.Match[str]) -> str:
        nonlocal bg_root_strips, shadow_strips
        selector = match.group(1)
        body = match.group(2)
        cleaned = body
        # Schatten immer raus
        cleaned, n_shadow = _SHADOW_PROP_RE.subn('', cleaned)
        shadow_strips += n_shadow
        # Wurzel-Hintergrund raus
        if _PAGE_ROOT_BG_SELECTOR_RE.match(selector or ''):
            cleaned, n_bg = _BG_PROP_RE.subn('', cleaned)
            bg_root_strips += n_bg
        return f'{selector}{{{cleaned}}}'

    new_css = _CSS_RULE_RE.sub(_process_rule, css)
    if bg_root_strips:
        notes.append(
            f'Hintergrundfarbe auf der Seitenwurzel entfernt ({bg_root_strips} Eigenschaft(en)) '
            '— Arbeitsblatt soll papierweiß bleiben.'
        )
    if shadow_strips:
        notes.append(f'{shadow_strips} Schatten-Eigenschaft(en) entfernt (Arbeitsblatt, kein Webdesign).')
    return new_css, notes


def _coerce_header_flag(req: dict[str, Any] | None) -> bool:
    """App-Kopfzeile (Titel/Untertitel) im Renderer.

    Standard im Kreativ-Modus: **aus** — die Seite endet logisch am Footer (mit Seitenzahl),
    der KI-Inhalt nutzt die volle Höhe darüber. Frontend-Toggle kann das überschreiben.
    """
    if not isinstance(req, dict):
        return False
    for key in ('show_sheet_header', 'creative_show_sheet_header'):
        if key not in req:
            continue
        v = req.get(key)
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)) and v in (0, 1):
            return bool(v)
        s = str(v).strip().lower()
        if s in ('0', 'false', 'no', 'off'):
            return False
        if s in ('1', 'true', 'yes', 'on'):
            return True
        return False
    return False


def repair_creative_html_worksheet(content: dict[str, Any], page_setup: dict) -> tuple[dict[str, Any], list[str]]:
    notes: list[str] = []
    if not isinstance(content, dict):
        return _fallback_sheet(), ['Ungültiger Arbeitsblatt-Inhalt — Platzhalter erzeugt.']

    out = dict(content)
    pages_raw = out.get('pages')
    if not isinstance(pages_raw, list) or len(pages_raw) == 0:
        out['pages'] = [
            {
                'page_label': '',
                'html': '<div class="ws-creative-page-inner"><p>Inhalt konnte nicht generiert werden.</p></div>',
                'page_css': '',
            }
        ]
        notes.append('Keine Seiten im Modell — Platzhalterseite eingefügt.')

    sanitized_pages: list[dict[str, Any]] = []
    for i, p in enumerate(out.get('pages') or []):
        if not isinstance(p, dict):
            notes.append(f'Seite {i + 1}: Ungültiges Objekt übersprungen.')
            continue
        html, nh = sanitize_html_fragment(str(p.get('html') or ''))
        css, nc = sanitize_css(str(p.get('page_css') or ''))
        css, nd = _strip_creative_css_decorations(css)
        notes.extend(nh)
        notes.extend(nc)
        notes.extend(nd)
        if not html.strip():
            html = '<div class="ws-creative-page-inner"><p>Leere Seite.</p></div>'
        sanitized_pages.append(
            {
                'page_label': str(p.get('page_label') or '')[:200],
                'html': html,
                'page_css': css,
            }
        )

    if not sanitized_pages:
        sanitized_pages = [
            {
                'page_label': '',
                'html': '<div class="ws-creative-page-inner"><p>Keine gültigen Seiten.</p></div>',
                'page_css': '',
            }
        ]
        notes.append('Sanitisierung ergab keine Seiten — Notizseite.')

    out['pages'] = sanitized_pages
    tmp = {**out, 'pages': list(sanitized_pages)}
    tmp, reflow_notes = apply_creative_reflow_if_needed(tmp, normalize_page_setup(page_setup))
    out['pages'] = tmp['pages']
    notes.extend(reflow_notes)
    out['render_kind'] = RENDER_KIND_CREATIVE_HTML
    title = str(out.get('title') or '').strip()
    out['title'] = title if title else 'Arbeitsblatt'
    if not isinstance(out.get('subtitle'), str):
        out['subtitle'] = str(out.get('subtitle') or '')
    if not isinstance(out.get('solutions'), list):
        out['solutions'] = []

    return out, notes


def build_creative_html_render_model(
    content: dict[str, Any],
    page_setup: dict,
    request_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    req = request_meta or {}
    page = normalize_page_setup(page_setup)
    show_sheet_header = _coerce_header_flag(req)
    pages_out: list[dict[str, Any]] = []
    for p in content.get('pages') or []:
        if not isinstance(p, dict):
            continue
        pages_out.append(
            {
                'page_label': str(p.get('page_label') or ''),
                'html': str(p.get('html') or ''),
                'page_css': str(p.get('page_css') or ''),
            }
        )
    return {
        'version': RENDER_KIND_CREATIVE_HTML,
        'page_setup': page,
        'pages': pages_out,
        'title': content.get('title', 'Arbeitsblatt'),
        'subtitle': content.get('subtitle', ''),
        'solutions': content.get('solutions') or [],
        'theme': req.get('theme', 'neutral'),
        'creativity': req.get('creativity', 'balanced'),
        'show_sheet_header': show_sheet_header,
        'tokens': {
            'palette': {
                'primary': '#111827',
                'secondary': '#525252',
                'soft': '#ffffff',
                'accent': '#525252',
            },
        },
    }


def is_creative_html_content(content: dict[str, Any] | None) -> bool:
    if not isinstance(content, dict):
        return False
    return (content.get('render_kind') or '').strip() == RENDER_KIND_CREATIVE_HTML


def worksheet_pages_are_creative_html_shape(content: dict[str, Any] | None) -> bool:
    """Seiten nutzen html/page_css statt blocks (z. B. ältere Inhalte ohne ``render_kind``)."""
    if not isinstance(content, dict):
        return False
    pages = content.get('pages')
    if not isinstance(pages, list) or len(pages) == 0:
        return False
    for p in pages:
        if not isinstance(p, dict):
            return False
        blocks = p.get('blocks')
        if isinstance(blocks, list) and len(blocks) > 0:
            return False
        if not str(p.get('html') or '').strip():
            return False
    return True


def _fallback_sheet() -> dict[str, Any]:
    return {
        'title': 'Arbeitsblatt',
        'subtitle': '',
        'render_kind': RENDER_KIND_CREATIVE_HTML,
        'pages': [
            {
                'page_label': '',
                'html': '<div class="ws-creative-page-inner"><p>Fehler bei der Generierung.</p></div>',
                'page_css': '',
            }
        ],
        'solutions': [],
    }
