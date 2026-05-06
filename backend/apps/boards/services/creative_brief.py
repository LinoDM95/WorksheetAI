"""CreativeBriefService — kondensiert Wunsch + Intent + Risk in einen prompt-fähigen Brief."""
from __future__ import annotations

from typing import Any

from django.conf import settings

from apps.ai.prompt_loader import build_creative_brief_prompt

from .ai_model_router import SmartboardAIModelRouter

_BRIEF_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'board_goal': {'type': 'STRING'},
        'audience': {'type': 'STRING'},
        'learning_goal': {'type': 'STRING'},
        'didactic_flow': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'phase': {'type': 'STRING'},
                    'goal': {'type': 'STRING'},
                    'interaction': {'type': 'STRING'},
                },
            },
        },
        'required_interactions': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'must_have': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'must_avoid': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'content_constraints': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'success_criteria': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'risks_to_handle': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
    },
    'required': ['board_goal', 'learning_goal'],
}

_VALID_PHASES = {'entry', 'exploration', 'practice', 'reflection'}


def _string_list(value: Any, *, max_items: int, max_len: int = 200) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for entry in value:
        s = str(entry).strip()
        if s:
            out.append(s[:max_len])
        if len(out) >= max_items:
            break
    return out


def _heuristic(payload: dict, intent: dict, risk: dict) -> dict:
    topic = str(payload.get('topic') or 'Board').strip()
    grade = str(payload.get('grade') or '').strip()
    subject = str(payload.get('subject') or '').strip()
    prompt_text = str(payload.get('prompt') or '').strip()
    interactions = list(intent.get('interaction_needs') or []) or ['Klick-Hotspots']
    flow_step = {
        'low': [('entry', 'Thema kurz vorstellen', 'Tippen/Klicken'),
                ('practice', 'Eine zentrale Aktivität', interactions[0] if interactions else 'Tippen')],
        'medium': [('entry', 'Thema einsteigen', 'Klick'),
                   ('exploration', 'Erkunden', interactions[0] if interactions else 'Hotspots'),
                   ('practice', 'Üben', interactions[-1] if interactions else 'Auswahl')],
        'high': [('entry', 'Thema rahmen', 'Klick'),
                 ('exploration', 'Vertiefen', interactions[0] if interactions else 'Hotspots'),
                 ('practice', 'Anwenden', interactions[-1] if interactions else 'Drag/Drop'),
                 ('reflection', 'Sichern', 'Reset + Reflexion')],
    }
    complexity = (risk.get('complexity') or intent.get('recommended_complexity') or 'medium').lower()
    if complexity == 'extreme':
        complexity = 'high'
    flow = [
        {'phase': p, 'goal': g, 'interaction': i}
        for (p, g, i) in flow_step.get(complexity, flow_step['medium'])
    ]
    must_avoid = ['externe Skripte', 'fetch/Netzwerk', 'eval', 'kleine Touchflächen <56px']
    must_have = ['Reset-Button', 'klare Touchflächen', 'sichtbares Feedback bei Aktionen']
    risks_to_handle = [
        f'{r.get("type", "")}: {r.get("mitigation", "")}'.strip(': ').strip()
        for r in (risk.get('risks') or [])[:3]
        if r.get('type')
    ]
    return {
        'board_goal': f'{topic} interaktiv vermitteln'.strip()[:200] or 'Interaktives Board',
        'audience': f'{subject} {grade}'.strip()[:200] or '— allgemein —',
        'learning_goal': prompt_text[:300] or f'Verständnis für {topic}.',
        'didactic_flow': flow,
        'required_interactions': interactions[:4],
        'must_have': must_have,
        'must_avoid': must_avoid,
        'content_constraints': [],
        'success_criteria': [
            'Lehrkraft kann das Board in unter 30 s einleiten.',
            'Schüler:innen erkennen sofort, was zu tun ist.',
        ],
        'risks_to_handle': risks_to_handle[:3],
        '_source': 'heuristic',
    }


def _normalize(ai: dict, fallback: dict) -> dict:
    out = {**fallback}
    for key in ('board_goal', 'audience', 'learning_goal'):
        v = str(ai.get(key) or '').strip()
        if v:
            out[key] = v[:400]
    flow_in = ai.get('didactic_flow')
    if isinstance(flow_in, list) and flow_in:
        flow: list[dict] = []
        for entry in flow_in[:4]:
            if not isinstance(entry, dict):
                continue
            phase = str(entry.get('phase') or '').strip().lower()
            if phase not in _VALID_PHASES:
                continue
            flow.append({
                'phase': phase,
                'goal': str(entry.get('goal') or '')[:200],
                'interaction': str(entry.get('interaction') or '')[:200],
            })
        if flow:
            out['didactic_flow'] = flow
    out['required_interactions'] = _string_list(ai.get('required_interactions'), max_items=4) or out['required_interactions']
    out['must_have'] = _string_list(ai.get('must_have'), max_items=5) or out['must_have']
    out['must_avoid'] = _string_list(ai.get('must_avoid'), max_items=5) or out['must_avoid']
    out['content_constraints'] = _string_list(ai.get('content_constraints'), max_items=6)
    out['success_criteria'] = _string_list(ai.get('success_criteria'), max_items=4) or out['success_criteria']
    out['risks_to_handle'] = _string_list(ai.get('risks_to_handle'), max_items=3) or out['risks_to_handle']
    return out


class CreativeBriefService:
    def __init__(self, *, router: SmartboardAIModelRouter | None = None) -> None:
        self._router = router

    def create(self, payload: dict, intent: dict, risk: dict) -> dict:
        fallback = _heuristic(payload or {}, intent or {}, risk or {})
        if not getattr(settings, 'SMARTBOARD_ENABLE_CREATIVE_BRIEF', True):
            return fallback
        if self._router is None:
            return fallback
        prompt = build_creative_brief_prompt({
            **(payload or {}),
            'intent': intent or {},
            'risk': risk or {},
        })
        complexity = (risk.get('complexity') or '').lower()
        ai = (
            self._router.call_large('creative_brief', prompt, response_schema=_BRIEF_SCHEMA, temperature=0.4)
            if complexity in ('high', 'extreme')
            else self._router.call_small('creative_brief', prompt, response_schema=_BRIEF_SCHEMA, temperature=0.4)
        )
        if not isinstance(ai, dict) or not ai:
            return fallback
        merged = _normalize(ai, fallback)
        merged['_source'] = 'model+heuristic'
        return merged
