"""Risiko-Analyse für Boards.

Regelbasierte Erkennung (immer aktiv) + optionales LLM-Refinement (`mitigation`-Texte,
`teacher_warning`). Pipeline benötigt nur die regelbasierte Variante zwingend.
"""
from __future__ import annotations

from typing import Any

from apps.ai.prompt_loader import build_risk_classifier_prompt

from .ai_model_router import SmartboardAIModelRouter

_RISK_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'overall_risk': {'type': 'STRING'},
        'risks': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'type': {'type': 'STRING'},
                    'level': {'type': 'STRING'},
                    'reason': {'type': 'STRING'},
                    'mitigation': {'type': 'STRING'},
                },
                'required': ['type', 'level'],
            },
        },
        'complexity': {'type': 'STRING'},
        'recommended_generation_strategy': {'type': 'STRING'},
        'should_warn_teacher': {'type': 'BOOLEAN'},
        'teacher_warning': {'type': 'STRING'},
    },
    'required': ['overall_risk', 'complexity', 'recommended_generation_strategy'],
}

_LEVELS = {'low', 'medium', 'high'}
_OVERALL = {'low', 'medium', 'high'}
_COMPLEXITY = {'low', 'medium', 'high', 'extreme'}
_STRATEGIES = {'simple', 'standard', 'careful', 'schematic_with_warning', 'needs_dataset'}
_RISK_TYPES = {
    'historical_accuracy', 'map_accuracy', 'touch_complexity', 'performance',
    'layout', 'responsive', 'math_correctness', 'safety', 'free_js_complexity',
}


def _lc(s: Any) -> str:
    return str(s or '').strip().lower()


def _heuristic(payload: dict, intent: dict) -> dict:
    text = ' '.join(_lc(payload.get(k)) for k in ('subject', 'grade', 'topic', 'prompt'))
    risks: list[dict] = []
    overall_levels: list[str] = []

    subject_area = _lc(intent.get('subject_area'))
    board_kind = _lc(intent.get('board_kind'))
    interactions = [str(x).lower() for x in (intent.get('interaction_needs') or [])]
    grade_band = _lc(intent.get('grade_band'))
    requested_complexity = _lc(intent.get('recommended_complexity')) or 'medium'

    # historische Karte / Genauigkeit
    if subject_area == 'history' and ('karte' in text or board_kind == 'map'):
        risks.append({
            'type': 'map_accuracy',
            'level': 'high',
            'reason': 'Historische Grenzen exakt zu zeichnen ist ohne echtes Dataset fehleranfällig.',
            'mitigation': 'Schematische Karte erstellen und sichtbar als „vereinfachte Darstellung" kennzeichnen.',
        })
        overall_levels.append('high')

    if subject_area == 'history':
        risks.append({
            'type': 'historical_accuracy',
            'level': 'medium',
            'reason': 'Daten/Jahreszahlen müssen geprüft werden.',
            'mitigation': 'Nur belegbare Eckdaten anzeigen; Quellen für die Lehrkraft im Teacher-Note vermerken.',
        })
        overall_levels.append('medium')

    # Komplexe Interaktionen / Simulation
    if board_kind == 'simulation' or 'simulation' in text:
        risks.append({
            'type': 'free_js_complexity',
            'level': 'high',
            'reason': 'Simulationen erfordern saubere Zustandsverwaltung und Reset-Logik.',
            'mitigation': 'Pointer-Events nutzen, Reset-Button vorsehen, keine setInterval-Endlosläufe.',
        })
        overall_levels.append('high')
        risks.append({
            'type': 'performance',
            'level': 'medium',
            'reason': 'Animationen können Smartboards belasten.',
            'mitigation': 'Animationen vereinfachen, requestAnimationFrame statt schwerer Loops.',
        })
        overall_levels.append('medium')

    # Touch-Komplexität
    if len(interactions) >= 3 or 'drag_drop' in interactions:
        risks.append({
            'type': 'touch_complexity',
            'level': 'medium' if len(interactions) < 4 else 'high',
            'reason': 'Mehrere parallele Interaktionsarten benötigen klare Touchflächen und Pointer-Events.',
            'mitigation': 'Mindestens 56px Touchflächen, touch-action: none auf Drag-Elementen, klare Reset-Aktion.',
        })
        overall_levels.append('medium' if len(interactions) < 4 else 'high')

    if 'drag_drop' in interactions or board_kind == 'drag_drop':
        risks.append({
            'type': 'safety',
            'level': 'low',
            'reason': 'Drag&Drop in iframe-Sandbox: native HTML5-DnD ist auf Touch unzuverlässig.',
            'mitigation': 'Pointer-Events (pointerdown/move/up) statt nativem dragstart.',
        })

    # Mathe-Korrektheit
    if subject_area == 'math':
        risks.append({
            'type': 'math_correctness',
            'level': 'medium',
            'reason': 'Berechnungen müssen exakt sein, gerade bei Brüchen/Geometrie.',
            'mitigation': 'Werte clientseitig validieren, fertige Lösungen explizit prüfen.',
        })
        overall_levels.append('medium')

    # Layout-Risiko bei kleinen Klassen mit viel Text
    if grade_band == 'primary':
        risks.append({
            'type': 'layout',
            'level': 'medium',
            'reason': 'Grundschule braucht große Schrift, große Buttons und wenig Text.',
            'mitigation': 'Mind. 64px Touchflächen, große Schrift, max. 1 Hauptinteraktion pro Ansicht.',
        })

    # Responsive
    risks.append({
        'type': 'responsive',
        'level': 'low',
        'reason': '16:9 Standard, aber Tablet-Modus möglich.',
        'mitigation': 'Bei kleinen Viewports overflow:auto erlauben.',
    })

    # Strategie & Komplexität ableiten
    has_high = 'high' in overall_levels
    extreme_signal = any(k in text for k in ('exakte historische grenzen', '3d', 'multiplayer', 'echtzeitdaten'))
    complexity = 'extreme' if extreme_signal else (
        'high' if has_high or requested_complexity == 'high' else (
            'low' if requested_complexity == 'low' else 'medium'
        )
    )
    strategy = 'standard'
    if any(r['type'] == 'map_accuracy' and r['level'] == 'high' for r in risks):
        strategy = 'schematic_with_warning'
    elif complexity == 'extreme':
        strategy = 'careful'
    elif complexity == 'low':
        strategy = 'simple'

    overall_risk = 'high' if has_high else ('low' if not overall_levels else 'medium')

    should_warn = strategy == 'schematic_with_warning' or complexity == 'extreme'
    teacher_warning = ''
    if should_warn:
        if strategy == 'schematic_with_warning':
            teacher_warning = (
                'Diese Darstellung ist absichtlich vereinfacht (schematisch). '
                'Bitte mit den Schüler:innen besprechen, dass historische Karten Idealisierungen sind.'
            )
        else:
            teacher_warning = (
                'Komplexer Inhalt — die Generierung erstellt eine vereinfachte, didaktische Variante.'
            )

    return {
        'overall_risk': overall_risk,
        'risks': risks[:6],
        'complexity': complexity,
        'recommended_generation_strategy': strategy,
        'should_warn_teacher': should_warn,
        'teacher_warning': teacher_warning,
        '_source': 'heuristic',
    }


def _coerce(value: Any, allowed: set[str], fallback: str) -> str:
    s = _lc(value)
    return s if s in allowed else fallback


def _normalize(ai: dict, fallback: dict) -> dict:
    out = {**fallback, **{k: v for k, v in ai.items() if v not in (None, '')}}
    out['overall_risk'] = _coerce(out.get('overall_risk'), _OVERALL, fallback['overall_risk'])
    out['complexity'] = _coerce(out.get('complexity'), _COMPLEXITY, fallback['complexity'])
    out['recommended_generation_strategy'] = _coerce(
        out.get('recommended_generation_strategy'), _STRATEGIES, fallback['recommended_generation_strategy'],
    )
    risks_in = out.get('risks')
    risks: list[dict] = []
    if isinstance(risks_in, list):
        for entry in risks_in[:6]:
            if not isinstance(entry, dict):
                continue
            t = _lc(entry.get('type'))
            level = _coerce(entry.get('level'), _LEVELS, 'medium')
            risks.append({
                'type': t if t in _RISK_TYPES else 'free_js_complexity',
                'level': level,
                'reason': str(entry.get('reason') or '')[:300],
                'mitigation': str(entry.get('mitigation') or '')[:300],
            })
    if not risks:
        risks = fallback['risks']
    out['risks'] = risks
    out['should_warn_teacher'] = bool(out.get('should_warn_teacher'))
    out['teacher_warning'] = str(out.get('teacher_warning') or '')[:400]
    return out


class RiskClassifier:
    def __init__(self, *, router: SmartboardAIModelRouter | None = None) -> None:
        self._router = router

    def classify(self, payload: dict, intent: dict) -> dict:
        fallback = _heuristic(payload or {}, intent or {})
        if self._router is None:
            return fallback
        prompt = build_risk_classifier_prompt({**(payload or {}), 'intent': intent or {}})
        ai = self._router.call_small('risk', prompt, response_schema=_RISK_SCHEMA, temperature=0.15)
        if not isinstance(ai, dict) or not ai:
            return fallback
        merged = _normalize(ai, fallback)
        merged['_source'] = 'small_model+rules'
        return merged
