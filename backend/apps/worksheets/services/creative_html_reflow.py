"""Heuristischer Umbruch für Kreativ-HTML: ``section.ws-flow-item`` über mehrere ``pages[n]``.

Die KI hält das A4-Maß oft nicht zuverlässig ein; der Renderer clippt Überlauf. Dieses Modul
zerlegt überfüllte Seiten anhand strukturierter Abschnitte und des ``content_line_budget`` aus
``page_setup`` (ohne Browser-Layout).
"""
from __future__ import annotations

import math
import re
from typing import Any

_WS_INNER_OPEN_RE = re.compile(
    r'<div\b(?=[^>]*\bws-creative-page-inner\b)(?=[^>]*\bclass\s*=)([^>]*)>',
    re.IGNORECASE,
)
_SECTION_CLOSE_MARKER = '</section>'

_HTML_TAG_STRIP_RE = re.compile(r'<[^>]+>')
_WS_COLLAPSE_RE = re.compile(r'\s+')


def _strip_tags_estimate_text(s: str) -> str:
    t = _HTML_TAG_STRIP_RE.sub(' ', s)
    return _WS_COLLAPSE_RE.sub(' ', t).strip()


def _estimate_flow_item_units(html_chunk: str) -> int:
    """Grobe „Zeileneinheiten“ je Abschnitt (konservativ für gemischtes HTML)."""
    plain = _strip_tags_estimate_text(html_chunk)
    chars = len(plain)
    u = max(3, int(math.ceil(chars / 85)))
    u += len(re.findall(r'<tr\b', html_chunk, re.I)) * 2
    li_n = len(re.findall(r'<li\b', html_chunk, re.I))
    u += max(0, int(math.ceil((li_n - 4) / 3)))
    img_n = len(re.findall(r'<img\b', html_chunk, re.I))
    u += img_n * 3
    return min(120, max(3, u))


def _capacity_units(page_setup: dict) -> int:
    ps = page_setup if isinstance(page_setup, dict) else {}
    b = ps.get('content_line_budget') if isinstance(ps.get('content_line_budget'), dict) else {}
    try:
        base = int(float(b.get('max_line_units_per_page') or 0))
    except (TypeError, ValueError):
        base = 0
    if base <= 0:
        base = 40
    factor = 0.42
    return max(12, int(math.floor(base * factor)))


def _find_matching_section_end(html: str, content_start: int) -> int:
    i = content_start
    depth = 1
    n = len(html)
    lower = html.lower()
    while i < n and depth > 0:
        no = lower.find('<section', i)
        nc = lower.find(_SECTION_CLOSE_MARKER.lower(), i)
        if nc == -1:
            return n
        if no != -1 and no < nc:
            depth += 1
            i = no + 8
            continue
        depth -= 1
        i = nc + len(_SECTION_CLOSE_MARKER)
    return i


def _iter_ws_flow_sections(html: str):
    """Liefert (start, end_excl) für jedes ``<section … ws-flow-item …>``."""
    pos = 0
    lower = html.lower()
    while pos < len(html):
        idx = lower.find('<section', pos)
        if idx == -1:
            break
        gt = html.find('>', idx)
        if gt == -1:
            break
        open_tag = html[idx : gt + 1]
        if 'ws-flow-item' not in open_tag.lower():
            pos = idx + 8
            continue
        end = _find_matching_section_end(html, gt + 1)
        yield idx, end
        pos = end


def _extract_page_inner_parts(html: str) -> tuple[str | None, str, str]:
    """``(open_tag_full, inner, tail_after_root)`` oder ``(None, html, '')`` wenn kein Root."""
    m = _WS_INNER_OPEN_RE.search(html)
    if not m:
        return None, html, ''
    open_full = m.group(0)
    start_inner = m.end()
    i = start_inner
    n = len(html)
    depth = 1
    lower = html.lower()
    while depth > 0 and i < n:
        next_open = lower.find('<div', i)
        next_close = lower.find('</div>', i)
        if next_close == -1:
            return open_full, html[start_inner:], ''
        if next_open != -1 and next_open < next_close:
            depth += 1
            i = next_open + 4
            continue
        depth -= 1
        close_end = next_close + len('</div>')
        if depth == 0:
            inner = html[start_inner:next_close]
            tail = html[close_end:]
            return open_full, inner, tail
        i = close_end
    return open_full, html[start_inner:], ''


def _build_page_html(open_tag: str, inner: str) -> str:
    return f'{open_tag}{inner}</div>'


def reflow_creative_html_pages(
    pages: list[dict[str, Any]],
    page_setup: dict,
    *,
    max_output_pages: int = 36,
) -> tuple[list[dict[str, Any]], list[str], bool]:
    """Teilt Seiten mit vielen / schweren ``ws-flow-item``-Abschnitten auf.

    Drittes Tuple-Element: ``True``, wenn mindestens eine Seite zerlegt wurde.
    """
    notes: list[str] = []
    if not pages:
        return pages, notes, False
    cap = _capacity_units(page_setup)
    out: list[dict[str, Any]] = []
    split_any = False

    for pi, p in enumerate(pages):
        if not isinstance(p, dict):
            continue
        html = str(p.get('html') or '')
        css = str(p.get('page_css') or '')
        label = str(p.get('page_label') or '')

        open_tag, inner, _tail = _extract_page_inner_parts(html)
        if open_tag is None:
            out.append(dict(p))
            continue

        spans = list(_iter_ws_flow_sections(inner))
        if not spans:
            out.append(dict(p))
            continue

        first_start = spans[0][0]
        prelude = inner[:first_start].strip()
        sections: list[str] = [inner[s:e] for s, e in spans]

        chunks: list[list[str]] = []
        current: list[str] = []
        used = 0
        if prelude:
            used += max(2, _estimate_flow_item_units(prelude))

        for sec in sections:
            w = _estimate_flow_item_units(sec)
            if current and used + w > cap:
                chunks.append(current)
                current = []
                used = 0
            current.append(sec)
            used += w

        if current:
            chunks.append(current)

        if len(chunks) <= 1:
            out.append(dict(p))
            continue

        projected = len(out) + len(chunks)
        if projected > max_output_pages:
            notes.append(
                f'layout (Kreativ): Zerlegung verworfen — würde {projected} Seiten erzeugen '
                f'(Limit {max_output_pages}).'
            )
            return [dict(x) for x in pages if isinstance(x, dict)], notes, False

        split_any = True
        notes.append(
            f'layout (Kreativ): Seite {pi + 1} in {len(chunks)} Druckseiten zerlegt '
            f'(budget ~{cap} Einheiten pro Seite).'
        )
        for ci, chunk in enumerate(chunks):
            parts_inner: list[str] = []
            if ci == 0 and prelude:
                parts_inner.append(prelude)
            parts_inner.extend(chunk)
            new_inner = ''.join(parts_inner)
            out.append(
                {
                    'page_label': label if ci == 0 else '',
                    'page_css': css,
                    'html': _build_page_html(open_tag, new_inner),
                }
            )

    return out, notes, split_any


def apply_creative_reflow_if_needed(content: dict[str, Any], page_setup: dict) -> tuple[dict[str, Any], list[str]]:
    pages = content.get('pages')
    if not isinstance(pages, list) or len(pages) == 0:
        return content, []
    merged_notes: list[str] = []

    normalized_setup = dict(page_setup) if isinstance(page_setup, dict) else {}
    if not isinstance(normalized_setup.get('content_line_budget'), dict):
        from .page import normalize_page_setup

        normalized_setup = normalize_page_setup(normalized_setup)

    cur: list[dict[str, Any]] = [dict(p) for p in pages if isinstance(p, dict)]
    any_split = False

    for _ in range(10):
        nxt, chunk_notes, did_split = reflow_creative_html_pages(cur, normalized_setup)
        merged_notes.extend(chunk_notes)
        cur = nxt
        any_split = any_split or did_split
        if not did_split:
            break

    if not any_split:
        return content, merged_notes

    from .content_blocks import normalize_multipage_page_labels

    labeled = normalize_multipage_page_labels(cur)
    return {**content, 'pages': labeled}, merged_notes
