"""Kreativ-Modus: KI liefert pro A4-Seite HTML/CSS-Fragmente (kein Block-JSON, kein LaTeX)."""
from __future__ import annotations

from typing import Any

from apps.boards.services.free_html_sanitize import sanitize_css, sanitize_html_fragment

from .page import normalize_page_setup

RENDER_KIND_CREATIVE_HTML = 'html-a4-creative-v1'


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
        notes.extend(nh)
        notes.extend(nc)
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
    out['render_kind'] = RENDER_KIND_CREATIVE_HTML
    title = str(out.get('title') or '').strip()
    out['title'] = title if title else 'Arbeitsblatt'
    if not isinstance(out.get('subtitle'), str):
        out['subtitle'] = str(out.get('subtitle') or '')
    if not isinstance(out.get('solutions'), list):
        out['solutions'] = []

    _ = page_setup
    return out, notes


def build_creative_html_render_model(
    content: dict[str, Any],
    page_setup: dict,
    request_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    req = request_meta or {}
    page = normalize_page_setup(page_setup)
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
