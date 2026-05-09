"""Deterministische Anwendung von KI-gestützten Arbeitsblatt-Strukturänderungen.

Nur sinnvoll im Bearbeitungs-Flow (PageRegenerate): Operationen kommen aus dem
Provider-JSON und werden hier validiert und auf ``content["pages"]`` angewendet.
"""
from __future__ import annotations

import copy
import re
from typing import Any

MAX_WORKSHEET_PAGES = 16


def build_document_outline(pages: list[dict], *, creative: bool) -> str:
    """Kompakte Übersicht aller Seiten für KI-Prompte (Indizes 0-basiert)."""
    lines: list[str] = []
    for i, page in enumerate(pages):
        if not isinstance(page, dict):
            continue
        label = str(page.get('page_label') or '').strip()
        if creative or (page.get('html') and not page.get('blocks')):
            n_flow = len(extract_flow_sections(str(page.get('html') or '')))
            lines.append(
                f'- Seite {i}: {label or "(ohne Label)"} — '
                f'{n_flow} ws-flow-item-Sektion(en) (Kreativ-HTML)'
            )
        else:
            blocks = page.get('blocks') or []
            if not isinstance(blocks, list):
                blocks = []
            bits: list[str] = []
            for j, b in enumerate(blocks[:12]):
                if not isinstance(b, dict):
                    continue
                bits.append(
                    f'  [{j}] {b.get("type") or "?"}: '
                    f'{str(b.get("title") or "")[:56] or "(ohne Titel)"}'
                )
            extra = ''
            if len(blocks) > 12:
                extra = f'\n  … +{len(blocks) - 12} weitere Blöcke'
            lines.append(
                f'- Seite {i}: {label or "(ohne Label)"} — {len(blocks)} Block(s)\n'
                + '\n'.join(bits)
                + extra
            )
    return '\n'.join(lines) if lines else '(keine Seiten)'


def extract_flow_sections(html: str) -> list[str]:
    """Direkte Kinder ``section.ws-flow-item`` innerhalb von ``.ws-creative-page-inner``."""
    inner = _extract_inner_html_fragment(html)
    if inner is None:
        return []
    return _split_ws_flow_sections(inner)


def _extract_inner_html_fragment(html: str) -> str | None:
    m = re.search(
        r'<div\b[^>]*\bclass="[^"]*\bws-creative-page-inner\b[^"]*"[^>]*>',
        html or '',
        flags=re.I,
    )
    if not m:
        return None
    start = m.end()
    depth = 1
    i = start
    n = len(html)
    while i < n and depth > 0:
        sub = html.find('<div', i)
        clo = html.find('</div>', i)
        if clo < 0:
            return html[start:]
        if sub >= 0 and sub < clo:
            depth += 1
            i = sub + 4
        else:
            depth -= 1
            i = clo + 6
    end = i - 6
    return html[start:end]


def _split_ws_flow_sections(inner: str) -> list[str]:
    sections: list[str] = []
    pattern = re.compile(
        r'<section\b(?=[^>]*\bclass="[^"]*\bws-flow-item\b[^"]*")[^>]*>',
        flags=re.I,
    )
    pos = 0
    while True:
        m = pattern.search(inner, pos)
        if not m:
            break
        start = m.start()
        i = m.end()
        depth = 1
        while depth > 0 and i < len(inner):
            ns = inner.find('<section', i)
            ne = inner.find('</section>', i)
            if ne < 0:
                return sections
            if ns >= 0 and ns < ne:
                depth += 1
                i = ns + 8
            else:
                depth -= 1
                i = ne + len('</section>')
        sections.append(inner[start:i])
        pos = i
    return sections


def _rebuild_creative_html(prefix: str, sections: list[str], suffix: str, page_css: str) -> tuple[str, str]:
    inner_body = f'{prefix}{"".join(sections)}{suffix}'
    wrapped = (
        f'<div class="ws-creative-page-inner">{inner_body}</div>'
        if inner_body.strip()
        else '<div class="ws-creative-page-inner"></div>'
    )
    return wrapped, page_css


def _parse_creative_page_parts(page: dict[str, Any]) -> tuple[str, list[str], str, str, str]:
    html = str(page.get('html') or '')
    css = str(page.get('page_css') or '')
    inner = _extract_inner_html_fragment(html)
    if inner is None:
        return html, [], '', '', css
    sections = _split_ws_flow_sections(inner)
    if not sections:
        return html, [], inner, '', css
    first_start = inner.find(sections[0])
    last_end = inner.find(sections[-1]) + len(sections[-1])
    prefix = inner[:first_start]
    suffix = inner[last_end:]
    return html, sections, prefix, suffix, css


def apply_document_operations(
    content: dict[str, Any],
    operations: list[dict[str, Any]],
    *,
    creative: bool,
    focus_page_index: int,
) -> tuple[list[str], int]:
    """Wendet Operationen auf ``content`` an (in-place).

    :returns: ``(notes, focus_page_index_after_ops)``
    """
    notes: list[str] = []
    focus = int(focus_page_index)
    pages = content.get('pages')
    if not isinstance(pages, list) or not pages:
        return ['Dokument hat keine Seiten — Strukturoperationen übersprungen.'], focus

    if not operations:
        return notes, focus

    for raw in operations:
        if not isinstance(raw, dict):
            notes.append('Übersprungen: keine Objekt-Operation.')
            continue
        op = str(raw.get('op') or '').strip().lower()
        if op == 'insert_page_after':
            focus = _op_insert_page_after(pages, raw, creative=creative, notes=notes, focus=focus)
        elif op == 'move_block' and not creative:
            focus = _op_move_block(pages, raw, notes=notes, focus=focus)
        elif op == 'move_flow_item' and creative:
            focus = _op_move_flow_item(pages, raw, notes=notes, focus=focus)
        else:
            notes.append(f'Unbekannte oder unpassende Operation ignoriert: {op!r}')

        if len(pages) > MAX_WORKSHEET_PAGES:
            notes.append(
                f'Seitenzahl limitiert auf {MAX_WORKSHEET_PAGES} — weitere Einfügungen nicht möglich.'
            )
            while len(pages) > MAX_WORKSHEET_PAGES:
                pages.pop()
    content['pages'] = pages
    return notes, focus


def _op_insert_page_after(
    pages: list[Any],
    raw: dict[str, Any],
    *,
    creative: bool,
    notes: list[str],
    focus: int,
) -> int:
    try:
        after_index = int(raw.get('after_index'))
    except (TypeError, ValueError):
        notes.append('insert_page_after: after_index ungültig.')
        return focus
    np = raw.get('new_page')
    if not isinstance(np, dict):
        notes.append('insert_page_after: new_page fehlt.')
        return focus
    insert_at = after_index + 1
    if insert_at < 0 or insert_at > len(pages):
        notes.append('insert_page_after: after_index außerhalb.')
        return focus
    if len(pages) >= MAX_WORKSHEET_PAGES:
        notes.append('insert_page_after: Seitenlimit erreicht.')
        return focus

    if creative:
        html = str(np.get('html') or '').strip()
        if not html:
            notes.append('insert_page_after: Kreativ-Seite ohne html.')
            return focus
        page = {
            'page_label': str(np.get('page_label') if np.get('page_label') is not None else ''),
            'html': html,
            'page_css': str(np.get('page_css') if np.get('page_css') is not None else ''),
        }
    else:
        blocks = np.get('blocks')
        if not isinstance(blocks, list) or not blocks:
            notes.append('insert_page_after: Baustein-Seite ohne blocks.')
            return focus
        page = {
            'page_label': str(np.get('page_label') if np.get('page_label') is not None else ''),
            'blocks': copy.deepcopy(blocks),
        }

    pages.insert(insert_at, page)
    notes.append(f'Eingefügt: neue Seite bei Index {insert_at} (nach after_index={after_index}).')
    if insert_at <= focus:
        return focus + 1
    return focus


def _op_move_block(
    pages: list[Any],
    raw: dict[str, Any],
    notes: list[str],
    focus: int,
) -> int:
    try:
        from_page = int(raw.get('from_page'))
        from_ix = int(raw.get('from_block_index'))
        to_page = int(raw.get('to_page'))
        to_ix = int(raw.get('to_block_index'))
    except (TypeError, ValueError):
        notes.append('move_block: Indizes ungültig.')
        return focus
    if not _page_ok(pages, from_page) or not _page_ok(pages, to_page):
        notes.append('move_block: Seitenindex außerhalb.')
        return focus
    src = pages[from_page]
    dst = pages[to_page]
    if not isinstance(src, dict) or not isinstance(dst, dict):
        return focus
    blocks_src = src.get('blocks')
    blocks_dst = dst.get('blocks')
    if not isinstance(blocks_src, list) or not isinstance(blocks_dst, list):
        notes.append('move_block: Ziel/Quelle ohne blocks.')
        return focus
    if from_ix < 0 or from_ix >= len(blocks_src):
        notes.append('move_block: from_block_index außerhalb.')
        return focus
    item = copy.deepcopy(blocks_src.pop(from_ix))
    ins = max(0, min(to_ix, len(blocks_dst)))
    blocks_dst.insert(ins, item)
    notes.append(
        f'Block von Seite {from_page}[{from_ix}] nach Seite {to_page}[{ins}] verschoben.'
    )
    return focus


def _op_move_flow_item(
    pages: list[Any],
    raw: dict[str, Any],
    notes: list[str],
    focus: int,
) -> int:
    try:
        from_page = int(raw.get('from_page'))
        from_sec = int(raw.get('from_section_index'))
        to_page = int(raw.get('to_page'))
        to_sec = int(raw.get('to_section_index'))
    except (TypeError, ValueError):
        notes.append('move_flow_item: Indizes ungültig.')
        return focus
    if not _page_ok(pages, from_page) or not _page_ok(pages, to_page):
        notes.append('move_flow_item: Seitenindex außerhalb.')
        return focus
    src = pages[from_page]
    dst = pages[to_page]
    if not isinstance(src, dict) or not isinstance(dst, dict):
        return focus
    _, secs_a, pre_a, suf_a, css_a = _parse_creative_page_parts(src)
    _, secs_b, pre_b, suf_b, css_b = _parse_creative_page_parts(dst)
    if not secs_a or from_sec < 0 or from_sec >= len(secs_a):
        notes.append('move_flow_item: Quell-Sektion fehlt oder Index ungültig.')
        return focus
    chunk = secs_a.pop(from_sec)
    ins = max(0, min(to_sec, len(secs_b)))
    secs_b.insert(ins, chunk)

    new_html_a, _ = _rebuild_creative_html(pre_a, secs_a, suf_a, css_a)
    new_html_b, _ = _rebuild_creative_html(pre_b, secs_b, suf_b, css_b)
    src['html'] = new_html_a
    dst['html'] = new_html_b
    notes.append(
        f'ws-flow-item von Seite {from_page}[{from_sec}] nach Seite {to_page}[{ins}] verschoben.'
    )
    return focus


def _page_ok(pages: list[Any], idx: int) -> bool:
    return 0 <= idx < len(pages)
