"""Hilfen für mehrseitige Inhalte (pages[]) und Legacy blocks."""

from __future__ import annotations

import copy
import re

_PAGE_LABEL_PREFIX_RE = re.compile(
    r'^\s*[Ss]eite\s+\d+\s*(?:(?:von|of)\s*\d+)?\s*(?:[—–\-:]\s*)?',
    re.UNICODE,
)


def _extract_label_topic(label: str | None) -> str:
    """Entfernt 'Seite X von Y —' Präfix, behält nur den thematischen Rest (z. B. 'Grundlagen')."""
    if not label:
        return ''
    s = str(label).strip()
    s = _PAGE_LABEL_PREFIX_RE.sub('', s, count=1)
    return s.strip()


def _normalize_page_labels(pages: list[dict]) -> list[dict]:
    """Vergibt konsistente Labels 'Seite k von N — Thema'.

    - Bei N==1: leer (kein "Seite 1 von 1").
    - Folgechunks ohne eigenes Thema übernehmen das Thema des letzten beschrifteten Vorgängers
      (typischer Fortsetzungs-Fall nach Reflow).
    """
    if not pages:
        return pages
    n = len(pages)
    topics_extracted = [_extract_label_topic(p.get('page_label') or '') for p in pages]
    filled: list[str] = []
    last_topic = ''
    for t in topics_extracted:
        if t:
            last_topic = t
        filled.append(last_topic)
    out: list[dict] = []
    for k, p in enumerate(pages):
        new_p = dict(p)
        if n == 1:
            new_p['page_label'] = ''
        else:
            base = f'Seite {k + 1} von {n}'
            topic = filled[k]
            new_p['page_label'] = f'{base} — {topic}' if topic else base
        out.append(new_p)
    return out

def repair_incomplete_ai_blocks(content: dict) -> tuple[dict, list[str]]:
    """Bereinigt Lücken nach der KI-Erzeugung.

    Sichtbar für Lernende dürfen **keine** Metakommentare stehen (z. B. „KI-Antwort“, „bitte eintragen“).
    Leere oder ungültige Blöcke bzw. Zeilen werden **entfernt**; technische Fallbacks nur dort, wo nötig
    (Diagramm-spec, Zeichenfeld, neutrale Kurz-Anweisung ohne KI-Bezug).
    """
    notes: list[str] = []
    pages = content.get('pages')
    if not isinstance(pages, list):
        return content, notes

    for pi, page in enumerate(pages):
        if not isinstance(page, dict):
            continue
        raw_blocks = page.get('blocks')
        if not isinstance(raw_blocks, list):
            continue
        new_blocks: list[dict] = []
        for bi, b in enumerate(raw_blocks):
            if not isinstance(b, dict):
                continue
            repaired = _repair_or_drop_block(b, pi, bi, notes)
            if repaired is not None:
                new_blocks.append(repaired)
        page['blocks'] = new_blocks

    return content, notes


def _repair_or_drop_block(b: dict, pi: int, bi: int, notes: list[str]) -> dict | None:
    """Gibt den Block zurück oder ``None``, wenn er ganz entfällt."""
    loc = f'Seite {pi + 1}, Block {bi + 1}'
    t = b.get('type')

    if t == 'text':
        c = (b.get('content') or '').strip()
        if not c:
            notes.append(f'{loc}: text ohne Inhalt — Block entfernt')
            return None
        return b

    if t == 'task_list':
        items = b.get('items')
        if not isinstance(items, list):
            notes.append(f'{loc}: task_list ohne items — Block entfernt')
            return None
        fixed: list[dict] = []
        for i, it in enumerate(items):
            if isinstance(it, dict):
                text = (it.get('text') or '').strip()
                if not text:
                    continue
                row = {'label': str(it.get('label', len(fixed) + 1)), 'text': text}
                if 'answer_lines' in it and it['answer_lines'] is not None:
                    row['answer_lines'] = it['answer_lines']
                fixed.append(row)
            else:
                s = str(it).strip()
                if not s:
                    continue
                fixed.append({'label': str(len(fixed) + 1), 'text': s})
        if not fixed:
            notes.append(f'{loc}: task_list ohne gültige Aufgaben — Block entfernt')
            return None
        for i, row in enumerate(fixed):
            if not str(row.get('label', '')).strip():
                row['label'] = str(i + 1)
        b['items'] = fixed
        return b

    if t == 'task_grid':
        items = b.get('items')
        if not isinstance(items, list):
            notes.append(f'{loc}: task_grid ohne items — Block entfernt')
            return None
        fixed: list[dict] = []
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                continue
            text = (it.get('text') or '').strip()
            if not text:
                continue
            label = str(it.get('label', i + 1))
            row: dict = {'label': label, 'text': text}
            if it.get('answer') is not None:
                row['answer'] = it['answer']
            fixed.append(row)
        if not fixed:
            notes.append(f'{loc}: task_grid ohne gültige Zeilen — Block entfernt')
            return None
        b['items'] = fixed
        return b

    if t == 'drawing_box':
        if not (b.get('instruction') or '').strip():
            b['instruction'] = 'Zeichnen und beschriften Sie im Kasten.'
            notes.append(f'{loc}: drawing_box.instruction neutral gesetzt')
        hm = b.get('height_mm')
        try:
            hm = float(hm)
        except (TypeError, ValueError):
            hm = None
        if hm is None or hm < 20:
            b['height_mm'] = 48
            notes.append(f'{loc}: drawing_box.height_mm Fallback 48')
        else:
            b['height_mm'] = max(25.0, min(float(hm), 190.0))
        return b

    if t == 'diagram':
        spec = b.get('spec')
        if not isinstance(spec, dict) or not str(spec.get('kind') or '').strip():
            b['spec'] = {
                'kind': 'unit_circle',
                'angle_deg': 40,
                'show_angle_arc': True,
                'show_projections': True,
                'point_label': 'P',
            }
            notes.append(f'{loc}: diagram.spec fehlte — Fallback Einheitskreis')
        return b

    if t == 'checklist':
        raw = b.get('items')
        if not isinstance(raw, list):
            return b
        kept: list[dict] = []
        for it in raw:
            if isinstance(it, dict):
                tx = (it.get('text') or '').strip()
                if tx:
                    kept.append({**it, 'text': tx})
            else:
                s = str(it).strip()
                if s:
                    kept.append({'text': s})
        if not kept:
            notes.append(f'{loc}: checklist ohne Punkte — Block entfernt')
            return None
        b['items'] = kept
        return b

    if t == 'table':
        rows = b.get('rows')
        if isinstance(rows, list) and len(rows) == 0 and (b.get('title') or '').strip():
            notes.append(f'{loc}: table ohne Zeilen — Block entfernt')
            return None
        rh = b.get('row_height_mm')
        if rh is not None and rh != '':
            try:
                rh = float(rh)
                if rh <= 0:
                    b.pop('row_height_mm', None)
                else:
                    rh = max(8.0, min(rh, 80.0))
                    b['row_height_mm'] = round(rh * 2) / 2
            except (TypeError, ValueError):
                b.pop('row_height_mm', None)
        return b

    return b


def iter_content_blocks(content: dict):
    pages = content.get('pages')
    if pages:
        for pg in pages:
            for b in pg.get('blocks') or []:
                yield b
    else:
        for b in content.get('blocks') or []:
            yield b


# Konservatives Platzbudget ≈ eine A4-Inhaltsfläche (Vorschau nutzt fixe Seitenhöhe; Überlauf clippt sonst).
PAGE_UNIT_BUDGET = 64.0
PER_PAGE_OVERHEAD = 12.0


def _estimate_task_item_units(it: dict | str) -> float:
    if not isinstance(it, dict):
        return 3.8
    al = it.get('answer_lines')
    if al is None:
        al = 6
    try:
        al = int(al)
    except (TypeError, ValueError):
        al = 6
    text = str(it.get('text') or '')
    return 2.5 + al * 1.28 + min(len(text) / 100, 3.5)


def estimate_block_units(b: dict) -> float:
    """Heuristik für Höhe eines Blocks (relative Einheiten, konservativ)."""
    if not isinstance(b, dict):
        return 4.0
    t = b.get('type')
    if t == 'text':
        lines = b.get('lines') or 0
        try:
            lines = int(lines)
        except (TypeError, ValueError):
            lines = 0
        c = str(b.get('content') or '')
        return 4.0 + min(len(c) / 280, 10) + max(0, lines) * 1.06
    if t == 'task_list':
        items = b.get('items') or []
        u = 3.2
        for it in items:
            u += _estimate_task_item_units(it if isinstance(it, dict) else {'text': str(it)})
        return u
    if t == 'task_grid':
        return 3.2 + len(b.get('items') or []) * 2.15
    if t == 'writing_lines':
        n = b.get('lines') or 10
        try:
            n = int(n)
        except (TypeError, ValueError):
            n = 10
        return 3.0 + max(0, n) * 1.06
    if t == 'drawing_box':
        hm = b.get('height_mm')
        try:
            hm = float(hm)
        except (TypeError, ValueError):
            hm = 48.0
        hm = max(25.0, min(hm, 190.0))
        u = 5.0 + hm / 5.0
        if b.get('expand_to_page_bottom'):
            u = max(u, 22.0)
        return min(u, 40.0)
    if t == 'diagram':
        return 15.0
    if t == 'table':
        n = len(b.get('rows') or [])
        u = 4.2 + n * 2.0
        rh = b.get('row_height_mm')
        try:
            rh = float(rh) if rh is not None and rh != '' else None
        except (TypeError, ValueError):
            rh = None
        if rh is not None and rh > 0:
            rh = max(8.0, min(rh, 80.0))
            u = 4.2 + n * max(2.0, rh / 4.0)
        return min(u, 48.0)
    if t == 'checklist':
        return 2.8 + len(b.get('items') or []) * 1.15
    return 4.5


def page_total_units(blocks: list) -> float:
    return PER_PAGE_OVERHEAD + sum(estimate_block_units(b) for b in blocks if isinstance(b, dict))


def _split_blocks_into_a4_chunks(blocks: list) -> list[list]:
    """Reihenfolge beibehalten; task_list bei Bedarf nur nach items splitten (Text 1:1)."""
    remaining = [copy.deepcopy(b) for b in blocks if isinstance(b, dict)]
    out: list[list] = []
    while remaining:
        chunk: list = []
        while remaining:
            b = remaining[0]
            if page_total_units(chunk + [b]) <= PAGE_UNIT_BUDGET:
                chunk.append(remaining.pop(0))
                continue
            if not chunk:
                if b.get('type') == 'task_list':
                    items = list(b.get('items') or [])
                    if len(items) > 1:
                        best = 0
                        for mid in range(len(items) - 1, 0, -1):
                            trial = {**b, 'items': items[:mid]}
                            if page_total_units([trial]) <= PAGE_UNIT_BUDGET:
                                best = mid
                                break
                        if best > 0:
                            first = {**b, 'items': items[:best]}
                            rest = copy.deepcopy(b)
                            rest['items'] = items[best:]
                            bid = str(b.get('id') or 'tl')
                            first['id'] = f'{bid}_a{len(out)}'
                            rest['id'] = f'{bid}_b{len(out)}'
                            chunk.append(first)
                            remaining[0] = rest
                            break
                chunk.append(remaining.pop(0))
                break
            break
        out.append(chunk)
    return out


def reflow_pages_for_a4_budget(pages: list[dict]) -> tuple[list[dict], list[str]]:
    """
    Jede logische ``pages[]``-Zeile wird in eine oder mehrere A4-taugliche Seiten zerlegt.
    Inhalte (insb. Aufgabentexte) bleiben unverändert; es wird nur umgebrochen.
    """
    notes: list[str] = []
    copies = []
    for p in pages:
        if not isinstance(p, dict):
            continue
        copies.append(
            {
                'page_label': str(p.get('page_label') or ''),
                'blocks': [copy.deepcopy(b) for b in (p.get('blocks') or []) if isinstance(b, dict)],
            }
        )
    out: list[dict] = []
    for pi, page in enumerate(copies):
        label = page['page_label']
        chunks = _split_blocks_into_a4_chunks(page['blocks'])
        if len(chunks) > 1:
            notes.append(
                f'layout: Ehemalige Logik-Seite {pi + 1} → {len(chunks)} A4-Seiten '
                '(automatischer Umbruch, Aufgabenwortlaut unverändert).'
            )
        for ci, ch in enumerate(chunks):
            lab = label if ci == 0 else ''
            out.append({'page_label': lab, 'blocks': ch})
    out = _normalize_page_labels(out)
    return out, notes


def apply_page_overflow_reflow(content: dict) -> tuple[dict, list[str]]:
    if not isinstance(content, dict):
        return content, []
    raw = content.get('pages')
    if not isinstance(raw, list) or not raw:
        return content, []
    new_pages, notes = reflow_pages_for_a4_budget(raw)
    if not new_pages:
        return content, []
    return {**content, 'pages': new_pages}, notes


_TASK_BLOCK_TYPES = frozenset({'task_grid', 'task_list'})


def _block_types(blocks: list) -> set:
    return {b.get('type') for b in blocks if isinstance(b, dict)}


def coalesce_trivial_multi_page_split(pages: list[dict]) -> tuple[list[dict], list[str]]:
    """
    Viele Modelle liefern pages[0] nur mit Einführung und pages[1] mit Aufgaben — im PDF erzwingt
    jede HTML-A4-Seite einen Seitenumbruch, obwohl alles auf ein Blatt passt.
    """
    notes: list[str] = []
    if len(pages) < 2:
        return pages, notes
    first_blocks = pages[0].get('blocks') or []
    second_blocks = pages[1].get('blocks') or []
    if not first_blocks or not second_blocks:
        return pages, notes
    t0 = _block_types(first_blocks)
    t1 = _block_types(second_blocks)
    if t0 & _TASK_BLOCK_TYPES:
        return pages, notes
    if not (t1 & _TASK_BLOCK_TYPES):
        return pages, notes
    if len(first_blocks) > 6:
        return pages, notes
    non_task_second = [b for b in second_blocks if isinstance(b, dict) and b.get('type') not in _TASK_BLOCK_TYPES]
    if len(non_task_second) > 2:
        return pages, notes
    merged_blocks = list(first_blocks) + list(second_blocks)
    if page_total_units(merged_blocks) > PAGE_UNIT_BUDGET:
        return pages, notes
    label0 = (pages[0].get('page_label') or '').strip()
    label1 = (pages[1].get('page_label') or '').strip()
    merged_label = label0 or label1
    merged = [
        {'page_label': merged_label, 'blocks': merged_blocks},
        *pages[2:],
    ]
    merged = _normalize_page_labels(merged)
    notes.append(
        'layout: Erste und zweite Seite zusammengeführt (Einführung + Aufgaben auf einem Blatt).'
    )
    return merged, notes


def apply_page_coalesce_to_content(content: dict) -> tuple[dict, list[str]]:
    """Schreibt zusammengeführte pages zurück in content (JSON der Lehrkraft bleibt konsistent zur Vorschau)."""
    if not isinstance(content, dict):
        return content, []
    raw = content.get('pages')
    if not isinstance(raw, list) or len(raw) < 2:
        return content, []
    pages = [{'page_label': p.get('page_label') or '', 'blocks': list(p.get('blocks') or [])} for p in raw]
    merged, notes = coalesce_trivial_multi_page_split(pages)
    if len(merged) == len(pages):
        return content, []
    out = {**content, 'pages': merged}
    return out, notes


def normalize_pages(content: dict) -> list[dict]:
    raw = content.get('pages')
    if raw:
        pages = [{'page_label': p.get('page_label') or '', 'blocks': list(p.get('blocks') or [])} for p in raw]
        pages, _ = coalesce_trivial_multi_page_split(pages)
        pages, _ = reflow_pages_for_a4_budget(pages)
        pages = _normalize_page_labels(pages)
        return pages
    bl = content.get('blocks') or []
    return [{'page_label': '', 'blocks': list(bl)}]
