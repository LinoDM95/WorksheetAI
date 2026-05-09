"""Heuristischer Umbruch für Kreativ-HTML — bewusst einfach gehalten.

Kerngedanke
-----------
Eine ``<section class="ws-flow-item">`` ist eine **atomare** didaktische Einheit
(Aufgabenkasten, Infoblock, Tabelle). Diese Einheiten werden über A4-Seiten verteilt,
aber **niemals zerschnitten** — Bilder, Listen und Aufgabentexte bleiben zusammen.

Wenn die KI keine ``ws-flow-item``-Sektionen liefert, bleibt der Inhalt **als Ganzes**
auf einer Seite (kein Fallback-Splitting an `<svg>` / `<p>`-Grenzen, das fragmentiert
nur Aufgaben in unleserliche Stücke).

Größenschätzung pro Sektion: hauptsächlich textbasiert. SVG/Bild-Illustrationen werden
nur leicht gewichtet — sie gehören zur Aufgabe, sind nicht "Layout-Volumen".
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
    """Grobe Einheiten-Schätzung: vorrangig Textmenge + Tabellenzeilen + Listenpunkte.

    SVG/Bild-Illustrationen werden bewusst **niedrig** gewichtet — sie gehören zur Aufgabe.
    Verhindert, dass Aufgaben mit kleinen Themen-Icons künstlich aufgebläht werden.
    """
    plain = _strip_tags_estimate_text(html_chunk)
    chars = len(plain)
    u = max(2, int(math.ceil(chars / 80)))
    u += html_chunk.lower().count('<tr')
    li_n = len(re.findall(r'<li\b', html_chunk, re.I))
    u += max(0, int(math.ceil((li_n - 2) / 2)))
    img_n = len(re.findall(r'<img\b', html_chunk, re.I))
    u += img_n
    if re.search(r'<svg\b[^>]*\b(width|height)\s*=\s*["\']?(\d+)', html_chunk, re.I):
        u += 2
    return max(2, u)


def _capacity_units(page_setup: dict) -> int:
    """Kapazität pro Druckseite in „Einheiten".

    Faktor 0.55 × ``max_line_units_per_page``: ws-flow-Sektionen mit Überschriften,
    Schreiblinien, Tabellen und Illustrationen sind in der echten Render-Höhe oft
    dichter als die reine Heuristik annimmt. Lieber eine Sektion früher splitten,
    als am Footer überzulaufen.
    """
    ps = page_setup if isinstance(page_setup, dict) else {}
    b = ps.get('content_line_budget') if isinstance(ps.get('content_line_budget'), dict) else {}
    try:
        base = int(float(b.get('max_line_units_per_page') or 0))
    except (TypeError, ValueError):
        base = 0
    if base <= 0:
        base = 40
    factor = 0.55
    return max(18, int(math.floor(base * factor)))


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
    """Yield (start, end) ranges für jede ``<section class="...ws-flow-item...">`` Top-Level."""
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


def _collect_atomic_sections(inner: str) -> list[str]:
    """Zerlege den Seiteninhalt in **atomare** ``ws-flow-item``-Sektionen plus optionalen Prelude.

    Ohne ws-flow-item: gib den ganzen Inhalt als **eine** Sektion zurück — niemals
    an `<svg>` / `<p>` / `<div>` zerstückeln.
    """
    s = inner.strip()
    if not s:
        return []
    spans = list(_iter_ws_flow_sections(s))
    if not spans:
        return [s]
    parts: list[str] = []
    first_start = spans[0][0]
    prelude = s[:first_start].strip()
    if prelude:
        parts.append(prelude)
    for a, b in spans:
        chunk = s[a:b].strip()
        if chunk:
            parts.append(chunk)
    last_end = spans[-1][1]
    postlude = s[last_end:].strip()
    if postlude:
        parts.append(postlude)
    return parts


def reflow_creative_html_pages(
    pages: list[dict[str, Any]],
    page_setup: dict,
    *,
    max_output_pages: int = 24,
) -> tuple[list[dict[str, Any]], list[str], bool]:
    """Verteile atomare Sektionen über A4-Seiten — niemals zerschnitten.

    Rückgabe-Tupel: ``(neue_pages, notizen, mutated)``.
    """
    notes: list[str] = []
    if not pages:
        return pages, notes, False
    cap = _capacity_units(page_setup)
    usable_cap = max(16, cap)
    out: list[dict[str, Any]] = []
    mutated = False

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

        sections = _collect_atomic_sections(inner)
        if len(sections) <= 1:
            out.append(dict(p))
            continue

        # Greedy-Pack: jede Sektion bleibt als Ganzes erhalten.
        weighted: list[tuple[str, int]] = [
            (s, _estimate_flow_item_units(s)) for s in sections
        ]
        chunks: list[list[str]] = []
        cur: list[str] = []
        used = 0
        for sec, w in weighted:
            if cur and used + w > usable_cap:
                chunks.append(cur)
                cur = []
                used = 0
            cur.append(sec)
            used += w
        if cur:
            chunks.append(cur)

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

        mutated = True
        notes.append(
            f'layout (Kreativ): Seite {pi + 1} in {len(chunks)} Druckseiten zerlegt '
            f'(budget ~{usable_cap} Einheiten pro Seite).'
        )
        for ci, chunk in enumerate(chunks):
            new_inner = ''.join(chunk)
            out.append(
                {
                    'page_label': label if ci == 0 else '',
                    'page_css': css,
                    'html': _build_page_html(open_tag, new_inner),
                }
            )

    return out, notes, mutated


def apply_creative_reflow_if_needed(
    content: dict[str, Any],
    page_setup: dict,
) -> tuple[dict[str, Any], list[str]]:
    pages = content.get('pages')
    if not isinstance(pages, list) or len(pages) == 0:
        return content, []
    merged_notes: list[str] = []

    normalized_setup = dict(page_setup) if isinstance(page_setup, dict) else {}
    if not isinstance(normalized_setup.get('content_line_budget'), dict):
        from .page import normalize_page_setup

        normalized_setup = normalize_page_setup(normalized_setup)

    cur: list[dict[str, Any]] = [dict(p) for p in pages if isinstance(p, dict)]
    did_apply = False

    for _ in range(8):
        nxt, chunk_notes, did_mutate = reflow_creative_html_pages(cur, normalized_setup)
        merged_notes.extend(chunk_notes)
        cur = nxt
        did_apply = did_apply or did_mutate
        if not did_mutate:
            break

    if not did_apply:
        return content, merged_notes

    from .content_blocks import normalize_multipage_page_labels

    labeled = normalize_multipage_page_labels(cur)
    return {**content, 'pages': labeled}, merged_notes
