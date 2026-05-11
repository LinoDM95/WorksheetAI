"""Klassenstufen 1–13: Anzeige-String, Bereich aus Payload, Rückwärts-Parsing."""

from __future__ import annotations

import re
from typing import Any


def parse_single_class_step(text: str) -> int | None:
    """Erkennt eine einzelne Stufe 1–13 aus typischen deutschen Angaben."""
    if not text or not str(text).strip():
        return None
    t = str(text).strip().lower().replace('–', '-').replace('—', '-')
    step_re = r'(1[0-3]|[1-9])'
    sequential = [
        re.compile(rf'(?:klasse|kl\.|kl)\s*{step_re}(?!\d)[a-zäöüß]*', re.I),
        re.compile(rf'(?:klasse|kl\.|kl)\s*{step_re}\b', re.I),
        re.compile(rf'(?:jahrgangsstufe|jahrgang|jg\.|jg)\s*{step_re}\b', re.I),
        re.compile(rf'(?:schuljahr|sj)\s*{step_re}\b', re.I),
        re.compile(rf'\b{step_re}\.\s*klasse\b', re.I),
        re.compile(rf'\b{step_re}te?\s*klasse\b', re.I),
        re.compile(rf'^\s*{step_re}\s*[a-z]{{0,2}}\s*$', re.I),
    ]
    for rgx in sequential:
        m = rgx.search(t)
        if m:
            v = int(m.group(1))
            if 1 <= v <= 13:
                return v
    fb = re.search(rf'\b{step_re}\b', t)
    if fb:
        v = int(fb.group(1))
        if 1 <= v <= 13:
            return v
    return None


def infer_bounds_from_grade_text(text: str) -> tuple[int | None, int | None]:
    """Aus Freitext: „5-8“, „5–8“ oder einzelne Stufe → (lo, hi). Sonst (None, None)."""
    if not text or not str(text).strip():
        return None, None
    raw = str(text).strip()
    t = raw.replace('–', '-').replace('—', '-')
    m = re.match(r'^(\d{1,2})\s*-\s*(\d{1,2})$', t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 1 <= a <= 13 and 1 <= b <= 13:
            return min(a, b), max(a, b)
    single = parse_single_class_step(raw)
    if single is not None:
        return single, single
    return None, None


def resolve_board_grade_fields(payload: dict[str, Any]) -> tuple[int | None, int | None, str]:
    """
    Liefert (grade_from, grade_to, grade_label) für Speicherung.
    Priorität: explizite grade_from / grade_to im Payload, sonst Legacy ``grade``-String.
    """
    gf_raw = payload.get('grade_from')
    gt_raw = payload.get('grade_to')
    if gf_raw is not None and gt_raw is not None:
        try:
            a = int(gf_raw)
            b = int(gt_raw)
        except (TypeError, ValueError):
            a = b = -1
        else:
            if 1 <= a <= 13 and 1 <= b <= 13:
                lo, hi = min(a, b), max(a, b)
                label = f'{lo}–{hi}' if lo != hi else str(lo)
                return lo, hi, label[:60]

    legacy = str(payload.get('grade') or '').strip()
    if legacy:
        inferred = infer_bounds_from_grade_text(legacy)
        if inferred[0] is not None and inferred[1] is not None:
            lo, hi = inferred
            label = f'{lo}–{hi}' if lo != hi else str(lo)
            return lo, hi, label[:60]
        return None, None, legacy[:60]
    return None, None, ''


def validate_creative_generate_payload(body: dict[str, Any]) -> None:
    """Pflichtfelder für POST /boards/generate/ (Kreativ)."""
    if not str(body.get('subject') or '').strip():
        raise ValueError('Fach ist ein Pflichtfeld.')
    if not str(body.get('title') or '').strip():
        raise ValueError('Titel ist ein Pflichtfeld.')
    if not str(body.get('topic') or '').strip():
        raise ValueError('Thema ist ein Pflichtfeld.')
    if not str(body.get('prompt') or '').strip():
        raise ValueError('Beschreibung / Prompt ist ein Pflichtfeld.')
    gf = body.get('grade_from')
    gt = body.get('grade_to')
    if gf is None or gt is None:
        raise ValueError('Klassenstufe „von“ und „bis“ sind Pflichtfelder.')
    try:
        a = int(gf)
        b = int(gt)
    except (TypeError, ValueError) as exc:
        raise ValueError('Klassenstufen müssen ganze Zahlen sein.') from exc
    if not (1 <= a <= 13 and 1 <= b <= 13):
        raise ValueError('Klassenstufen müssen zwischen 1 und 13 liegen.')
