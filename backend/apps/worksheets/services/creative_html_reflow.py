"""Heuristischer Umbruch für Kreativ-HTML: strukturierte Abschnitte oder Fallback-Blöcke über mehrere ``pages[n]``.

Die KI hält das A4-Maß oft nicht zuverlässig ein; Überlauf wird serverseitig gemindert durch Aufteilen
von Inhalt entlang ``section.ws-flow-item``, Block-Level-Markup, Tabellenzeilen, Absatzenden oder –
als letzte Stufe – im Absatzinneren vorhandenen Fließtext. Basis: ``content_line_budget``.
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

_BLOCK_SEGMENT_START_RE = re.compile(
    r'(?=<(?:p\b|h[1-6]\b|ul\b|ol\b|table\b|figure\b|blockquote\b|svg\b|dl\b|div\b)[^a-z0-9-])',
    re.IGNORECASE,
)

_WS_FLOW_WRAP_RE = re.compile(
    r'^\s*<section\b[^>]*ws-flow-item[^>]*>([\s\S]*)</section>\s*$',
    re.IGNORECASE,
)

_SPLIT_MAX_DEPTH = 56


def _strip_tags_estimate_text(s: str) -> str:
    t = _HTML_TAG_STRIP_RE.sub(' ', s)
    return _WS_COLLAPSE_RE.sub(' ', t).strip()


def _estimate_flow_item_units(html_chunk: str) -> int:
    plain = _strip_tags_estimate_text(html_chunk)
    chars = len(plain)
    u = max(3, int(math.ceil(chars / 76)))
    u += html_chunk.lower().count('<tr')
    svg_n = len(re.findall(r'<svg\b', html_chunk, re.I))
    path_n = len(re.findall(r'<path\b', html_chunk, re.I))
    u += svg_n * 4 + max(0, int(math.ceil(path_n / 6)))
    div_n = len(re.findall(r'<div\b', html_chunk, re.I))
    u += max(0, (div_n - 3) // 6)
    li_n = len(re.findall(r'<li\b', html_chunk, re.I))
    u += max(0, int(math.ceil((li_n - 3) / 2)))
    img_n = len(re.findall(r'<img\b', html_chunk, re.I))
    u += img_n * 3
    return min(155, max(3, u))


def _capacity_units(page_setup: dict) -> int:
    ps = page_setup if isinstance(page_setup, dict) else {}
    b = ps.get('content_line_budget') if isinstance(ps.get('content_line_budget'), dict) else {}
    try:
        base = int(float(b.get('max_line_units_per_page') or 0))
    except (TypeError, ValueError):
        base = 0
    if base <= 0:
        base = 40
    factor = 0.36
    return max(15, int(math.floor(base * factor)))


def _wrap_ws_flow(inner_html: str) -> str:
    stripped = inner_html.strip()
    if not stripped:
        return ''
    if stripped.lower().startswith('<section') and 'ws-flow-item' in stripped[:240].lower():
        return stripped
    return f'<section class="ws-flow-item">{stripped}</section>'


def _fallback_block_segments(inner: str) -> list[str]:
    s = inner.strip()
    if not s:
        return []
    spans: list[str] = []
    last = 0
    for m in _BLOCK_SEGMENT_START_RE.finditer(s):
        if m.start() > last:
            prefix = s[last : m.start()].strip()
            if prefix:
                spans.append(prefix)
        last = m.start()
    if last < len(s):
        tail = s[last:].strip()
        if tail:
            spans.append(tail)
    return spans if spans else [s]


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


def _binary_split_html_core(core: str) -> tuple[str, str]:
    n = len(core)
    mid = n // 2
    pivot = core.rfind('>', max(0, mid // 2 - 1), mid + max(260, mid // 2))
    if pivot < mid // 2:
        pivot = core.find('>', mid)
    if pivot < 0:
        pivot = mid
    lo = core[: pivot + 1].strip()
    hi = core[pivot + 1 :].strip()
    return lo, hi


def _segments_fit_single_cap(inner_plain: str, cap: int) -> bool:
    s = inner_plain.strip()
    if not s:
        return True
    return _estimate_flow_item_units(_wrap_ws_flow(s)) <= cap


def _paragraph_fragments(trimmed: str) -> list[str] | None:
    low = trimmed.lower()
    if '</p>' not in low:
        return None
    parts: list[str] = []
    start = 0
    for m in re.finditer(r'(?is)</p\s*>', trimmed):
        frag = trimmed[start : m.end()].strip()
        if frag:
            parts.append(frag)
        start = m.end()
    remn = trimmed[start:].strip()
    if remn:
        parts.append(remn)
    return parts if len(parts) >= 2 else None


def _split_oversized_flow_core(core: str, cap: int, *, depth: int = 0) -> list[str]:
    stripped = core.strip()
    if not stripped:
        return []
    wrapped = _wrap_ws_flow(stripped)
    estimate = min(999, _estimate_flow_item_units(wrapped))
    if estimate <= cap or depth >= _SPLIT_MAX_DEPTH or len(stripped) < 32:
        return [stripped]
    tbl = stripped.lower().count('<tr')
    close_tr = stripped.lower().count('</tr')
    parts = None
    if tbl >= 2 and close_tr >= 2:
        split_tr = _split_preserving_between_tags(stripped, r'(?is)(</tr\s*>)')
        if len(split_tr) >= 2:
            parts = split_tr
    if parts is None:
        parts = _paragraph_fragments(stripped)
    if parts is None:
        low = stripped.lower()
        inner_split = '</li>' if '</li>' in low else '</p>' if '</p>' not in low and '<br' in low else None
        if inner_split == '</li>':
            li_parts = _split_preserving_between_tags(stripped, r'(?is)(</li\s*>)')
            if len(li_parts) >= 2:
                parts = li_parts
    if parts:
        flattened: list[str] = []
        for p in parts:
            flattened.extend(_split_oversized_flow_core(p, cap, depth=depth + 1))
        return flattened if flattened else [stripped]

    lp = stripped.lower()
    if lp.startswith('<p') and stripped.rstrip().lower().endswith('</p>'):
        inner_m = re.search(r'^[ \t]*<p\b[^>]*>([\s\S]*)</p\s*>$', stripped, re.I)
        body = inner_m.group(1) if inner_m else stripped
        char_budget = max(90, cap * 54)
        sub = _chunk_body_plain_by_budget(body, char_budget)
        if len(sub) >= 2:
            return [_reopen_closed_p(s) for s in sub]

    lo, hi = _binary_split_html_core(stripped)
    if not hi.strip():
        tiny = stripped[: max(320, len(stripped) // 2)]
        rest = stripped[len(tiny) :].strip()
        if not rest:
            return [stripped]
        return _split_oversized_flow_core(tiny, cap, depth=depth + 1) + _split_oversized_flow_core(
            rest,
            cap,
            depth=depth + 1,
        )
    return _split_oversized_flow_core(lo, cap, depth=depth + 1) + _split_oversized_flow_core(
        hi,
        cap,
        depth=depth + 1,
    )


def _reopen_closed_p(fragment: str) -> str:
    t = fragment.strip()
    low = t.lower()
    if low.startswith('<p') and '</p' in low:
        return t
    return f'<p>{t}</p>'


def _split_preserving_between_tags(html: str, pattern: str) -> list[str]:
    out: list[str] = []
    start = 0
    rx = re.compile(pattern)
    for m in rx.finditer(html):
        block = html[start : m.end()].strip()
        if block:
            out.append(block)
        start = m.end()
    tail = html[start:].strip()
    if tail:
        out.append(tail)
    return out


def _chunk_body_plain_by_budget(plain_inside: str, max_plain_chars: int) -> list[str]:
    txt = plain_inside
    lim = max(80, max_plain_chars)
    if len(_strip_tags_estimate_text(txt)) <= lim:
        return [txt if txt.strip() else plain_inside]
    cuts: list[str] = []
    bare = txt
    n = len(bare)
    acc = ''
    anchor = 0
    last_space = None
    i = 0
    while i < n:
        c = bare[i]
        acc += c
        if c.isspace():
            last_space = i
        if len(acc) >= lim and last_space is not None and last_space > anchor:
            cuts.append(bare[anchor:last_space].strip())
            anchor = last_space + 1
            i = anchor
            acc = ''
            last_space = None
            continue
        i += 1
    if anchor < n:
        cuts.append(bare[anchor:n].strip())
    return [c for c in cuts if c]


def _expand_sections_to_budget(sections: list[str], cap: int) -> list[str]:
    out: list[str] = []
    for sec in sections:
        stripped = sec.strip()
        if not stripped:
            continue
        inner = stripped
        m = _WS_FLOW_WRAP_RE.match(stripped)
        if m:
            inner = m.group(1).strip()
        cores = _split_oversized_flow_core(inner, cap)
        out.extend([_wrap_ws_flow(c) for c in cores if c.strip()])
    return out


def _collect_segments(inner: str, cap: int) -> list[str]:
    spans = list(_iter_ws_flow_sections(inner))
    if spans:
        first_start = spans[0][0]
        prelude = inner[:first_start].strip()
        sections = [inner[s:e] for s, e in spans]
        prelude_bits: list[str] = []
        if prelude.strip():
            if _segments_fit_single_cap(prelude, cap):
                prelude_bits = [prelude.strip()]
            else:
                prelude_bits.extend(_expand_sections_to_budget([_wrap_ws_flow(prelude.strip())], cap))
        normalized = prelude_bits + _expand_sections_to_budget(sections, cap)
        return [s for s in normalized if s.strip()]

    tentative = inner.strip()
    if not tentative:
        return []
    if _segments_fit_single_cap(tentative, cap):
        return [tentative]
    raw_parts = _fallback_block_segments(tentative)
    sections_wrapped = [_wrap_ws_flow(p) for p in raw_parts]
    normalized = _expand_sections_to_budget(sections_wrapped, cap)
    return [s for s in normalized if s.strip()]


def reflow_creative_html_pages(
    pages: list[dict[str, Any]],
    page_setup: dict,
    *,
    max_output_pages: int = 36,
) -> tuple[list[dict[str, Any]], list[str], bool]:
    """Seiten zerlegen oder überlange Einzelblöcke innerhalb eines Blatts aufteilen.

    Boolesches Tupelteil: gesetzt sobald Ausgaben sich vom Ausgangs-HTML unterscheiden.
    """

    notes: list[str] = []
    if not pages:
        return pages, notes, False
    cap = _capacity_units(page_setup)
    usable_cap = max(13, int(round(cap * 0.97)) - max(1, cap // 22))
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

        segments = _collect_segments(inner.strip(), usable_cap)
        if not segments:
            out.append(dict(p))
            continue

        chunks: list[list[str]] = []
        cur: list[str] = []
        used = 0
        for sec in segments:
            w = max(4, _estimate_flow_item_units(sec))
            if cur and used + w > usable_cap:
                chunks.append(cur)
                cur = []
                used = 0
            cur.append(sec)
            used += w
        if cur:
            chunks.append(cur)

        if len(chunks) <= 1:
            rebuilt_inner = ''.join(segments).strip()
            if rebuilt_inner and rebuilt_inner != inner.strip():
                out.append(
                    {
                        'page_label': label,
                        'page_css': css,
                        'html': _build_page_html(open_tag, rebuilt_inner),
                    }
                )
                mutated = True
            else:
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
    did_apply = False

    for _ in range(24):
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