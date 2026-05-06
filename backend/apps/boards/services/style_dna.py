"""StyleDNAService — visuelle Identität pro Board.

Liefert Style-DNA (Metapher, Farbpalette, Form/Bewegung/Typografie). Wenn das LLM
nicht antwortet, generiert die Heuristik eine fach- und klassenstufenpassende DNA aus
einem festen Katalog (siehe ``VISUAL_METAPHOR_CATALOG``). Die DNA wird im
Generation-Prompt eingebettet — das verhindert, dass alle Boards gleich aussehen.
"""
from __future__ import annotations

from typing import Any

from django.conf import settings

from apps.ai.prompt_loader import build_style_dna_prompt

from .ai_model_router import SmartboardAIModelRouter


# Visuelle Metaphern (§10 — pro Fach mehrere kompakte Optionen).
VISUAL_METAPHOR_CATALOG: dict[str, list[dict[str, Any]]] = {
    'math': [
        {'metaphor': 'Mathe-Pizzeria', 'palette': {'primary': '#e8593f', 'accent': '#f6c560', 'background': '#fff8ef'}},
        {'metaphor': 'Schokoladenfabrik', 'palette': {'primary': '#5b3a29', 'accent': '#c08d5f', 'background': '#fbf3ea'}},
        {'metaphor': 'Mathe-Labor', 'palette': {'primary': '#2563eb', 'accent': '#22d3ee', 'background': '#eef2ff'}},
        {'metaphor': 'Weltraum-Energiezellen', 'palette': {'primary': '#7c3aed', 'accent': '#facc15', 'background': '#0f172a'}},
        {'metaphor': 'Schatzkarte', 'palette': {'primary': '#92400e', 'accent': '#f59e0b', 'background': '#fef3c7'}},
        {'metaphor': 'Baukasten', 'palette': {'primary': '#dc2626', 'accent': '#facc15', 'background': '#fef9c3'}},
    ],
    'history': [
        {'metaphor': 'Museumsausstellung', 'palette': {'primary': '#4b3621', 'accent': '#bfa07a', 'background': '#f5f1e8'}},
        {'metaphor': 'Historischer Atlas', 'palette': {'primary': '#1f2937', 'accent': '#b45309', 'background': '#f5e9d3'}},
        {'metaphor': 'Aktenwand', 'palette': {'primary': '#3f3f46', 'accent': '#dc2626', 'background': '#f4f4f5'}},
        {'metaphor': 'Nachrichtenstudio', 'palette': {'primary': '#0f172a', 'accent': '#dc2626', 'background': '#f8fafc'}},
        {'metaphor': 'Zeitreise-Konsole', 'palette': {'primary': '#1e3a8a', 'accent': '#22d3ee', 'background': '#0b1220'}},
        {'metaphor': 'Archivraum', 'palette': {'primary': '#3f2d1a', 'accent': '#a16207', 'background': '#fdf6e3'}},
    ],
    'science': [
        {'metaphor': 'Forschungslabor', 'palette': {'primary': '#0e7490', 'accent': '#22d3ee', 'background': '#ecfeff'}},
        {'metaphor': 'Naturpfad', 'palette': {'primary': '#166534', 'accent': '#84cc16', 'background': '#f0fdf4'}},
        {'metaphor': 'Mikroskop-Ansicht', 'palette': {'primary': '#1e3a8a', 'accent': '#facc15', 'background': '#eff6ff'}},
        {'metaphor': 'Ökosystem-Karte', 'palette': {'primary': '#065f46', 'accent': '#fbbf24', 'background': '#ecfdf5'}},
        {'metaphor': 'Experimentierstation', 'palette': {'primary': '#1d4ed8', 'accent': '#f97316', 'background': '#eef2ff'}},
    ],
    'physics': [
        {'metaphor': 'Labor-Konsole', 'palette': {'primary': '#0f172a', 'accent': '#06b6d4', 'background': '#f1f5f9'}},
        {'metaphor': 'Simulationspult', 'palette': {'primary': '#1f2937', 'accent': '#3b82f6', 'background': '#f8fafc'}},
        {'metaphor': 'Werkstatt', 'palette': {'primary': '#78350f', 'accent': '#f59e0b', 'background': '#fef3c7'}},
        {'metaphor': 'Messstation', 'palette': {'primary': '#1e293b', 'accent': '#22d3ee', 'background': '#e2e8f0'}},
    ],
    'language': [
        {'metaphor': 'Sprachwerkstatt', 'palette': {'primary': '#7c2d12', 'accent': '#f97316', 'background': '#fff7ed'}},
        {'metaphor': 'Storyboard', 'palette': {'primary': '#1d4ed8', 'accent': '#facc15', 'background': '#eff6ff'}},
        {'metaphor': 'Theaterbühne', 'palette': {'primary': '#831843', 'accent': '#fbbf24', 'background': '#fdf2f8'}},
        {'metaphor': 'Detektivbüro', 'palette': {'primary': '#1f2937', 'accent': '#dc2626', 'background': '#f3f4f6'}},
        {'metaphor': 'Vokabel-Abenteuer', 'palette': {'primary': '#15803d', 'accent': '#facc15', 'background': '#f0fdf4'}},
    ],
    'primary': [
        {'metaphor': 'Lernreise', 'palette': {'primary': '#2563eb', 'accent': '#fde047', 'background': '#fefce8'}},
        {'metaphor': 'Monster-Mission', 'palette': {'primary': '#7c3aed', 'accent': '#22d3ee', 'background': '#f5f3ff'}},
        {'metaphor': 'Tierpark', 'palette': {'primary': '#15803d', 'accent': '#fbbf24', 'background': '#ecfccb'}},
        {'metaphor': 'Schatzinsel', 'palette': {'primary': '#0e7490', 'accent': '#f59e0b', 'background': '#fef3c7'}},
        {'metaphor': 'Zauberwald', 'palette': {'primary': '#166534', 'accent': '#a78bfa', 'background': '#f0fdf4'}},
        {'metaphor': 'Weltraumreise', 'palette': {'primary': '#1e1b4b', 'accent': '#facc15', 'background': '#0f172a'}},
    ],
    'general': [
        {'metaphor': 'Lernkarten-Wand', 'palette': {'primary': '#1f2937', 'accent': '#22c55e', 'background': '#f8fafc'}},
        {'metaphor': 'Klassenraum-Tafel', 'palette': {'primary': '#0f766e', 'accent': '#fbbf24', 'background': '#f0fdfa'}},
    ],
}

_SHAPE = {'rounded', 'geometric', 'organic', 'sketchy', 'tech'}
_MOTION = {'subtle', 'playful', 'deliberate', 'none'}
_TYPO = {'system_clean', 'serif_editorial', 'display_friendly', 'mono_tech'}
_LAYOUT = {'card_grid', 'stage_focus', 'atlas_panel', 'console', 'story_lane'}
_DENSITY = {'low', 'medium', 'high'}
_AGE = {'kindergarten', 'primary', 'secondary', 'adult'}
_INTERACTION = {'tap', 'drag', 'slider', 'hotspot', 'hybrid'}

_HEX_RE = __import__('re').compile(r'^#[0-9a-fA-F]{6}$')


def _summarize_catalog(area: str | None) -> str:
    selected = []
    for key in (area, 'general'):
        if not key:
            continue
        for entry in VISUAL_METAPHOR_CATALOG.get(key, []):
            selected.append(f'- {entry["metaphor"]} (Palette ≈ primary {entry["palette"]["primary"]})')
        if selected:
            break
    return '\n'.join(selected) or '— frei wählbar —'


def _heuristic(payload: dict, intent: dict, brief: dict) -> dict:
    area = (intent.get('subject_area') or 'general').lower()
    grade_band = (intent.get('grade_band') or 'unknown').lower()
    catalog = VISUAL_METAPHOR_CATALOG.get(area) or VISUAL_METAPHOR_CATALOG['general']
    chosen = catalog[0]
    palette = chosen['palette']
    age = (
        'primary' if grade_band == 'primary'
        else 'secondary' if grade_band == 'lower_secondary'
        else 'adult' if grade_band == 'upper_secondary'
        else 'secondary'
    )
    density = 'low' if age == 'primary' else ('high' if age == 'adult' else 'medium')
    motion = 'playful' if age == 'primary' else 'subtle'
    shape = 'rounded' if age == 'primary' else ('geometric' if area in ('math', 'physics') else 'organic')
    typography = 'display_friendly' if age == 'primary' else 'system_clean'
    layout = (
        'story_lane' if (intent.get('board_kind') or '') == 'story'
        else 'atlas_panel' if (intent.get('board_kind') or '') == 'map'
        else 'console' if area in ('physics', 'science') and 'Simulation' in str(brief.get('board_goal') or '')
        else 'card_grid'
    )
    interaction = (
        'drag' if 'drag_drop' in (intent.get('interaction_needs') or [])
        else 'slider' if 'slider' in (intent.get('interaction_needs') or [])
        else 'hotspot' if 'hotspots' in (intent.get('interaction_needs') or [])
        else 'tap'
    )
    return {
        'visual_metaphor': chosen['metaphor'],
        'mood': 'klar, einladend, lernfokussiert',
        'palette': {
            'background': palette.get('background', '#f8fafc'),
            'surface': '#ffffff',
            'primary': palette['primary'],
            'secondary': palette.get('secondary', palette['primary']),
            'accent': palette['accent'],
            'text': '#111827',
        },
        'shape_language': shape,
        'motion_language': motion,
        'typography_direction': typography,
        'layout_principle': layout,
        'density': density,
        'age_style': age,
        'interaction_style': interaction,
        'consistency_rules': [
            'Alle Buttons mit derselben Eckenrundung.',
            'Headline-Stil pro Bühne nur einmal verwenden.',
            'Akzentfarbe nur für eine Aktion auf einer Ansicht.',
        ],
        '_source': 'heuristic',
    }


def _coerce(value: Any, allowed: set[str], fallback: str) -> str:
    s = str(value or '').strip().lower()
    return s if s in allowed else fallback


def _hex_or(value: Any, fallback: str) -> str:
    s = str(value or '').strip()
    return s if _HEX_RE.match(s) else fallback


def _normalize(ai: dict, fallback: dict) -> dict:
    out = {**fallback}
    if ai.get('visual_metaphor'):
        out['visual_metaphor'] = str(ai['visual_metaphor'])[:120]
    if ai.get('mood'):
        out['mood'] = str(ai['mood'])[:160]
    palette = ai.get('palette') or {}
    if isinstance(palette, dict):
        out['palette'] = {
            'background': _hex_or(palette.get('background'), out['palette']['background']),
            'surface': _hex_or(palette.get('surface'), out['palette']['surface']),
            'primary': _hex_or(palette.get('primary'), out['palette']['primary']),
            'secondary': _hex_or(palette.get('secondary'), out['palette']['secondary']),
            'accent': _hex_or(palette.get('accent'), out['palette']['accent']),
            'text': _hex_or(palette.get('text'), out['palette']['text']),
        }
    out['shape_language'] = _coerce(ai.get('shape_language'), _SHAPE, fallback['shape_language'])
    out['motion_language'] = _coerce(ai.get('motion_language'), _MOTION, fallback['motion_language'])
    out['typography_direction'] = _coerce(ai.get('typography_direction'), _TYPO, fallback['typography_direction'])
    out['layout_principle'] = _coerce(ai.get('layout_principle'), _LAYOUT, fallback['layout_principle'])
    out['density'] = _coerce(ai.get('density'), _DENSITY, fallback['density'])
    out['age_style'] = _coerce(ai.get('age_style'), _AGE, fallback['age_style'])
    out['interaction_style'] = _coerce(ai.get('interaction_style'), _INTERACTION, fallback['interaction_style'])
    rules = ai.get('consistency_rules')
    if isinstance(rules, list):
        cleaned = [str(r).strip()[:200] for r in rules if str(r).strip()][:5]
        if cleaned:
            out['consistency_rules'] = cleaned
    return out


_DNA_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'visual_metaphor': {'type': 'STRING'},
        'mood': {'type': 'STRING'},
        'palette': {
            'type': 'OBJECT',
            'properties': {
                'background': {'type': 'STRING'},
                'surface': {'type': 'STRING'},
                'primary': {'type': 'STRING'},
                'secondary': {'type': 'STRING'},
                'accent': {'type': 'STRING'},
                'text': {'type': 'STRING'},
            },
        },
        'shape_language': {'type': 'STRING'},
        'motion_language': {'type': 'STRING'},
        'typography_direction': {'type': 'STRING'},
        'layout_principle': {'type': 'STRING'},
        'density': {'type': 'STRING'},
        'age_style': {'type': 'STRING'},
        'interaction_style': {'type': 'STRING'},
        'consistency_rules': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
    },
}


class StyleDNAService:
    def __init__(self, *, router: SmartboardAIModelRouter | None = None) -> None:
        self._router = router

    def create(self, payload: dict, intent: dict, risk: dict, creative_brief: dict) -> dict:
        fallback = _heuristic(payload or {}, intent or {}, creative_brief or {})
        if not getattr(settings, 'SMARTBOARD_ENABLE_STYLE_DNA', True):
            return fallback
        if self._router is None:
            return fallback
        prompt = build_style_dna_prompt({
            **(payload or {}),
            'intent': intent or {},
            'risk': risk or {},
            'creative_brief': creative_brief or {},
            'visual_metaphor_catalog': _summarize_catalog((intent or {}).get('subject_area')),
        })
        ai = self._router.call_small('style_dna', prompt, response_schema=_DNA_SCHEMA, temperature=0.55)
        if not isinstance(ai, dict) or not ai:
            return fallback
        merged = _normalize(ai, fallback)
        merged['_source'] = 'small_model+heuristic'
        return merged
