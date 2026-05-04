"""Zeilen-Budget pro A4 für KI-Prompts (LaTeX-\\baselineskip-Modell, skaliert mit Rändern und Ausrichtung)."""
from __future__ import annotations

import math

from django.conf import settings

# LaTeX/DTP-Punkt: 1 pt = 1/72 Zoll ≈ 0.3528 mm.
_MM_PER_PT = 25.4 / 72.0

# Heuristik: größere Schrift / lockerer Zeilenabstand = weniger „Zeileneinheiten“ pro Seite.
_PRESENTATION_TEXT_SCALE_FACTORS: dict[str, float] = {
    'xs': 1.06,
    'sm': 1.03,
    'md': 1.0,
    'lg': 0.88,
    'xl': 0.78,
}
_PRESENTATION_LINE_HEIGHT_FACTORS: dict[str, float] = {
    'tight': 1.05,
    'normal': 1.0,
    'relaxed': 0.88,
}


def _f(name: str, default: float) -> float:
    v = getattr(settings, name, default)
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def compute_content_line_budget(page_setup: dict | None) -> dict:
    """
    Nutzbare Höhe = safe_area.height − reservierter Kopf − reservierter Fuß (außerhalb des Fließtextes).
    Zeilenkapazität = nutzbare Höhe / \\baselineskip (LaTeX-nah, konfigurierbar in pt).
    """
    ps = page_setup if isinstance(page_setup, dict) else {}
    safe = ps.get('safe_area') if isinstance(ps.get('safe_area'), dict) else {}
    try:
        safe_h = float(safe.get('height_mm') or 0)
    except (TypeError, ValueError):
        safe_h = 0.0
    if safe_h <= 0:
        safe_h = 250.0

    bs_pt = _f('WORKSHEET_LINE_BUDGET_BASELINESKIP_PT', 13.6)
    if bs_pt <= 0:
        bs_pt = 13.6
    bs_mm = bs_pt * _MM_PER_PT

    head = _f('WORKSHEET_LINE_BUDGET_HEADER_RESERVE_MM', 26.0)
    foot = _f('WORKSHEET_LINE_BUDGET_FOOTER_RESERVE_MM', 16.0)
    head = max(0.0, head)
    foot = max(0.0, foot)

    usable = safe_h - head - foot
    usable = max(20.0, usable)

    physical = usable / bs_mm if bs_mm > 0 else 0.0
    physical_lines = max(0, int(math.floor(physical)))

    factor = _f('WORKSHEET_LINE_BUDGET_CONTENT_FACTOR', 0.70)
    factor = min(max(factor, 0.35), 1.0)
    capped = physical * factor
    max_units = max(8, int(math.floor(capped)))

    orientation = ps.get('orientation') if ps.get('orientation') in ('portrait', 'landscape') else 'portrait'

    return {
        'model': 'latex_baselineskip_a4',
        'orientation': orientation,
        'baselineskip_pt': round(bs_pt, 4),
        'baselineskip_mm': round(bs_mm, 4),
        'reserved_header_mm': round(head, 2),
        'reserved_footer_mm': round(foot, 2),
        'safe_area_height_mm': round(safe_h, 2),
        'usable_body_height_mm': round(usable, 2),
        'physical_text_lines_if_full_body': physical_lines,
        'content_capacity_factor': round(factor, 4),
        'max_line_units_per_page': max_units,
        'presentation_scale_hint': {
            'text_scale': dict(_PRESENTATION_TEXT_SCALE_FACTORS),
            'line_height': dict(_PRESENTATION_LINE_HEIGHT_FACTORS),
        },
        'effective_budget_formula_de': (
            'Für gewähltes presentation: '
            'effective_max = floor(max_line_units_per_page * text_scale[Faktor] * line_height[Faktor]) '
            '(Faktoren siehe presentation_scale_hint).'
        ),
        'interpretation_de': (
            'max_line_units_per_page bezieht sich auf md + normal: gemischtes Arbeitsblatt '
            '(Überschriften, Aufgaben, Linien) verbraucht typischerweise deutlich mehr '
            '"Zeileneinheiten" als reiner Fließtext — bei vielen Blöcken eher 60–75 % der Zahl anstreben.'
        ),
    }
