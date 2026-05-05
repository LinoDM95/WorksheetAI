"""Kuratierte Theme-Tokens für den Bausteinmodus.

Tokens sind reine Dicts — keine externen Schriften, keine Bilder.
Pro Generation wird **ein** Theme ausgewählt; jeder Baustein-Render erhält das
Theme als Argument und nutzt nur die unten definierten Token-Keys.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Theme:
    id: str
    label: str
    description: str
    tokens: dict[str, str] = field(default_factory=dict)


_BASE_TOKENS: dict[str, str] = {
    # Schrift
    'font_family': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    'font_size_xs': '14px',
    'font_size_sm': '16px',
    'font_size_md': '18px',
    'font_size_lg': '22px',
    'font_size_xl': '28px',
    'font_size_2xl': '34px',
    'line_height_tight': '1.25',
    'line_height_normal': '1.45',
    # Geometrie
    'radius_sm': '8px',
    'radius_md': '14px',
    'radius_lg': '20px',
    'gap_xs': '8px',
    'gap_sm': '12px',
    'gap_md': '20px',
    'gap_lg': '28px',
    # Schatten / Border
    'shadow_card': '0 1px 2px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.06)',
    'shadow_pop': '0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.08)',
    'border_subtle': '1px solid rgba(15,23,42,0.10)',
    # Touch
    'touch_min': '48px',
}


def _theme(id_: str, label: str, description: str, **overrides: str) -> Theme:
    return Theme(id=id_, label=label, description=description, tokens={**_BASE_TOKENS, **overrides})


THEMES: list[Theme] = [
    _theme(
        'primary_school',
        'Grundschule (verspielt)',
        'Warme Farben, große Schrift, weiche Kanten — geeignet für Klassen 1–6.',
        bg='#FFF7ED',
        bg_card='#FFFFFF',
        bg_chip='#FEF3C7',
        text='#1F2937',
        text_muted='#475569',
        primary='#F97316',
        primary_text='#FFFFFF',
        accent='#0EA5E9',
        success='#16A34A',
        danger='#DC2626',
        focus='#F59E0B',
        font_size_md='20px',
        font_size_lg='26px',
        font_size_xl='34px',
        font_size_2xl='42px',
        radius_md='18px',
        radius_lg='26px',
    ),
    _theme(
        'museum',
        'Museum (sachlich)',
        'Gedeckte Töne, ruhige Hintergründe — ideal für Sek I/II, Geschichte, Kunst.',
        bg='#F5F5F4',
        bg_card='#FFFFFF',
        bg_chip='#E7E5E4',
        text='#1C1917',
        text_muted='#57534E',
        primary='#7C2D12',
        primary_text='#FFFFFF',
        accent='#0F766E',
        success='#15803D',
        danger='#B91C1C',
        focus='#A16207',
    ),
    _theme(
        'science',
        'Science Lab',
        'Klare Linien, Indigo-Akzente — Mathematik, Physik, Chemie, Informatik.',
        bg='#F8FAFC',
        bg_card='#FFFFFF',
        bg_chip='#E0E7FF',
        text='#0F172A',
        text_muted='#475569',
        primary='#4F46E5',
        primary_text='#FFFFFF',
        accent='#0891B2',
        success='#16A34A',
        danger='#DC2626',
        focus='#6366F1',
    ),
    _theme(
        'chalkboard',
        'Tafel / Kreide',
        'Dunkler Hintergrund, helle Linien — wirkt wie eine echte Tafel.',
        bg='#0F172A',
        bg_card='#1E293B',
        bg_chip='#334155',
        text='#F8FAFC',
        text_muted='#CBD5E1',
        primary='#FACC15',
        primary_text='#0F172A',
        accent='#38BDF8',
        success='#4ADE80',
        danger='#F87171',
        focus='#FACC15',
    ),
]

THEME_BY_ID: dict[str, Theme] = {t.id: t for t in THEMES}
DEFAULT_THEME_ID = 'science'


def resolve_theme(theme_id: str | None) -> Theme:
    """Liefert ein Theme aus der Liste; fällt sicher auf Default zurück."""
    key = (theme_id or '').strip().lower()
    if key == 'auto' or not key:
        return THEME_BY_ID[DEFAULT_THEME_ID]
    return THEME_BY_ID.get(key, THEME_BY_ID[DEFAULT_THEME_ID])


def theme_to_css_vars(theme: Theme, prefix: str = '--bb-') -> str:
    """Wandelt Theme-Tokens in CSS-Custom-Properties (im :root von .free-board)."""
    parts = []
    for k, v in theme.tokens.items():
        css_key = k.replace('_', '-')
        parts.append(f'{prefix}{css_key}: {v};')
    return '\n  '.join(parts)


def theme_summary() -> list[dict[str, Any]]:
    return [{'id': t.id, 'label': t.label, 'description': t.description} for t in THEMES]
