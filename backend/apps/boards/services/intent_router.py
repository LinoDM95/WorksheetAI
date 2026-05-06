"""Intent-Analyse für Boards.

Heuristik first → kleines Modell ergänzt unsichere Felder. Heuristik allein muss
ein syntaktisch valides Ergebnis liefern (Pipeline läuft auch ohne LLM weiter).
"""
from __future__ import annotations

from typing import Any

from apps.ai.prompt_loader import build_intent_router_prompt

from .ai_model_router import SmartboardAIModelRouter

_INTENT_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'subject_area': {'type': 'STRING'},
        'grade_band': {'type': 'STRING'},
        'board_kind': {'type': 'STRING'},
        'interaction_needs': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'content_needs': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'recommended_visual_direction': {'type': 'STRING'},
        'recommended_complexity': {'type': 'STRING'},
        'teacher_prompt_summary': {'type': 'STRING'},
    },
    'required': ['subject_area', 'grade_band', 'board_kind', 'recommended_complexity'],
}

_SUBJECT_AREAS = {'math', 'history', 'geography', 'science', 'language', 'primary', 'politics', 'general'}
_GRADE_BANDS = {'primary', 'lower_secondary', 'upper_secondary', 'unknown'}
_BOARD_KINDS = {'map', 'timeline', 'simulation', 'quiz', 'drag_drop', 'process', 'diagram', 'story', 'mixed'}
_VISUAL_DIRS = {'historical_atlas', 'primary_playful', 'science_lab', 'math_grid', 'documentary', 'storybook', 'auto'}
_COMPLEXITY = {'low', 'medium', 'high'}

_KEYWORDS_HISTORY = ('krieg', 'grenze', 'reich', 'antike', 'mittelalter', 'weltkrieg', 'revolution', 'kalt', 'migration')
_KEYWORDS_GEO = ('karte', 'kontinent', 'land', 'europa', 'asien', 'afrika', 'fluss', 'gebirge', 'klima', 'topograph')
_KEYWORDS_MATH = ('bruch', 'zahlenstrahl', 'gleichung', 'prozent', 'addition', 'subtraktion', 'multiplikation', 'division',
                  'geometrie', 'volumen', 'flächen', 'wurzel', 'gleichung')
_KEYWORDS_SCIENCE = ('wasser', 'kreislauf', 'verdunstung', 'teilchen', 'stromkreis', 'photosynthese', 'zelle', 'magnet',
                     'experiment', 'energie', 'oxidation')
_KEYWORDS_LANG = ('vokabel', 'englisch', 'französisch', 'spanisch', 'satz', 'grammatik', 'wortschatz', 'lesen', 'schreiben')
_KEYWORDS_POL = ('wahl', 'demokratie', 'parlament', 'regierung', 'gesetz', 'verfassung')
_KEYWORDS_PRIMARY = ('grundschule', 'klasse 1', 'klasse 2', 'klasse 3', 'klasse 4', '1. klasse', '2. klasse',
                     '3. klasse', '4. klasse', 'einschulung', 'erstklass')

_KEYWORDS_MAP = ('karte', 'verteilung', 'gebiet', 'land')
_KEYWORDS_TIMELINE = ('zeitstrahl', 'zeitleiste', 'chronolog', 'epoche')
_KEYWORDS_SIM = ('simulation', 'simulier', 'experiment', 'kreislauf')
_KEYWORDS_QUIZ = ('quiz', 'fragen', 'multiple choice', 'mc-aufgabe')
_KEYWORDS_DRAG = ('zuordnung', 'zuordnen', 'drag', 'verschieben', 'paare', 'memory')
_KEYWORDS_PROCESS = ('prozess', 'ablauf', 'kreislauf', 'phasen')
_KEYWORDS_DIAGRAM = ('diagramm', 'graph', 'schaubild')
_KEYWORDS_STORY = ('geschichte', 'erzählen', 'storyboard', 'märchen')


def _lc(s: Any) -> str:
    return str(s or '').strip().lower()


def _heuristic(payload: dict) -> dict:
    text = ' '.join(_lc(payload.get(k)) for k in ('subject', 'grade', 'topic', 'prompt'))

    subject_area = 'general'
    if any(k in text for k in _KEYWORDS_HISTORY):
        subject_area = 'history'
    elif any(k in text for k in _KEYWORDS_GEO):
        subject_area = 'geography'
    elif any(k in text for k in _KEYWORDS_MATH):
        subject_area = 'math'
    elif any(k in text for k in _KEYWORDS_SCIENCE):
        subject_area = 'science'
    elif any(k in text for k in _KEYWORDS_LANG):
        subject_area = 'language'
    elif any(k in text for k in _KEYWORDS_POL):
        subject_area = 'politics'

    grade_band = 'unknown'
    if any(k in text for k in _KEYWORDS_PRIMARY):
        grade_band = 'primary'
        if subject_area == 'general':
            subject_area = 'primary'
    elif any(k in text for k in ('klasse 5', 'klasse 6', 'klasse 7', 'klasse 8', 'sek i', 'sekundarstufe i')):
        grade_band = 'lower_secondary'
    elif any(k in text for k in ('klasse 9', 'klasse 10', 'klasse 11', 'klasse 12', 'klasse 13',
                                  'oberstufe', 'sek ii', 'sekundarstufe ii', 'abitur', 'gymnasium oberstufe')):
        grade_band = 'upper_secondary'

    board_kind = 'mixed'
    interaction_needs: list[str] = []
    if any(k in text for k in _KEYWORDS_MAP):
        board_kind = 'map'
        interaction_needs.append('hotspots')
    if any(k in text for k in _KEYWORDS_TIMELINE):
        board_kind = 'timeline'
        interaction_needs.append('timeline')
    if any(k in text for k in _KEYWORDS_SIM):
        board_kind = 'simulation'
        interaction_needs.append('slider')
    if any(k in text for k in _KEYWORDS_QUIZ):
        board_kind = 'quiz'
        interaction_needs.append('quiz')
    if any(k in text for k in _KEYWORDS_DRAG):
        board_kind = 'drag_drop'
        interaction_needs.append('drag_drop')
    if any(k in text for k in _KEYWORDS_PROCESS):
        board_kind = 'process'
    if any(k in text for k in _KEYWORDS_DIAGRAM):
        board_kind = 'diagram'
    if any(k in text for k in _KEYWORDS_STORY):
        board_kind = 'story'

    content_needs: list[str] = []
    if subject_area in ('history', 'geography') and 'karte' in text:
        content_needs.append('map_data')
    if subject_area == 'history':
        content_needs.append('factual_accuracy')
    if subject_area == 'math':
        content_needs.append('calculations')

    visual_dir = 'auto'
    if subject_area == 'history':
        visual_dir = 'historical_atlas'
    elif subject_area == 'science':
        visual_dir = 'science_lab'
    elif subject_area == 'math':
        visual_dir = 'math_grid'
    elif grade_band == 'primary' or subject_area == 'primary':
        visual_dir = 'primary_playful'

    complexity = 'medium'
    if grade_band == 'primary' and len(interaction_needs) <= 1:
        complexity = 'low'
    if len(interaction_needs) >= 3 or 'simulation' in text or subject_area == 'history':
        complexity = 'high'

    summary = (str(payload.get('prompt') or '').strip()[:200]).strip()
    return {
        'subject_area': subject_area,
        'grade_band': grade_band,
        'board_kind': board_kind,
        'interaction_needs': sorted(set(interaction_needs))[:5],
        'content_needs': sorted(set(content_needs))[:5],
        'recommended_visual_direction': visual_dir,
        'recommended_complexity': complexity,
        'teacher_prompt_summary': summary,
        '_source': 'heuristic',
    }


def _coerce(value: Any, allowed: set[str], fallback: str) -> str:
    s = _lc(value)
    return s if s in allowed else fallback


def _normalize(intent: dict, fallback: dict) -> dict:
    out = {**fallback, **{k: v for k, v in intent.items() if v not in (None, '')}}
    out['subject_area'] = _coerce(out.get('subject_area'), _SUBJECT_AREAS, fallback['subject_area'])
    out['grade_band'] = _coerce(out.get('grade_band'), _GRADE_BANDS, fallback['grade_band'])
    out['board_kind'] = _coerce(out.get('board_kind'), _BOARD_KINDS, fallback['board_kind'])
    out['recommended_visual_direction'] = _coerce(
        out.get('recommended_visual_direction'), _VISUAL_DIRS, fallback['recommended_visual_direction'],
    )
    out['recommended_complexity'] = _coerce(
        out.get('recommended_complexity'), _COMPLEXITY, fallback['recommended_complexity'],
    )
    for key in ('interaction_needs', 'content_needs'):
        v = out.get(key)
        if not isinstance(v, list):
            v = []
        out[key] = [str(x).strip() for x in v if str(x).strip()][:5]
    out['teacher_prompt_summary'] = str(out.get('teacher_prompt_summary') or '')[:300]
    return out


class IntentRouter:
    """Liefert ein Intent-JSON nach §6 der Spezifikation."""

    def __init__(self, *, router: SmartboardAIModelRouter | None = None) -> None:
        self._router = router

    def analyze(self, payload: dict) -> dict:
        fallback = _heuristic(payload or {})
        if self._router is None:
            return fallback
        prompt = build_intent_router_prompt(payload or {})
        ai = self._router.call_small(
            'intent', prompt, response_schema=_INTENT_SCHEMA, temperature=0.1,
        )
        if not isinstance(ai, dict) or not ai:
            return fallback
        merged = _normalize(ai, fallback)
        merged['_source'] = 'small_model+heuristic'
        return merged
