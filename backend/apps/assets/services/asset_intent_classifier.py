"""Asset Intent Classifier.

Erkennt aus Lehrerprompt + Creative Brief + Style DNA, ob ein Board überhaupt
custom Assets benötigt. Heuristik zuerst, optional KI-Refinement durch das
kleine Modell. Ziel: für viele „sachliche" Boards (Diagramme, Map+Dataset)
gar keine teure SVG-Generation auslösen.
"""

from __future__ import annotations

import logging
import re
from typing import Any


logger = logging.getLogger(__name__)


_RESPONSE_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'needs_custom_assets': {'type': 'boolean'},
        'asset_complexity': {'type': 'string', 'enum': ['low', 'medium', 'high']},
        'asset_categories': {'type': 'array', 'items': {'type': 'string'}},
        'hero_assets_needed': {'type': 'boolean'},
        'estimated_asset_count': {'type': 'integer'},
        'notes': {'type': 'string'},
    },
    'required': ['needs_custom_assets', 'asset_complexity', 'asset_categories', 'estimated_asset_count'],
}


# Wörter, die typischerweise eigene Figuren/Szenen verlangen.
_FIGURE_WORDS = re.compile(
    r'\b(b(?:är|aer)|hase|fuchs|monster|alien|drache|tier|figur|maskottchen|charakter|'
    r'stern|sonne|wolke|haus|baum|wiese|karte_mit|forscher|astronaut|pirat|ritter)\b',
    re.IGNORECASE,
)
_SCENE_WORDS = re.compile(
    r'\b(szene|landschaft|hintergrund|umgebung|welt|insel|wald|meer|raum|labor|kueche|'
    r'bauernhof|stadt|dorf|park|garten)\b',
    re.IGNORECASE,
)
_BORING_WORDS = re.compile(
    r'\b(diagramm|tabelle|infografik|graph|kurve|formel|nur text|nüchtern|nuechtern|'
    r'sachlich|reine fakten|grenzkarte|dataset|atlas)\b',
    re.IGNORECASE,
)


class AssetIntentClassifier:
    """Heuristik + AI."""

    def __init__(self, *, router=None) -> None:
        self.router = router

    def analyze(
        self,
        payload: dict[str, Any],
        intent: dict[str, Any] | None = None,
        creative_brief: dict[str, Any] | None = None,
        style_dna: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        heuristic = self._heuristic(payload, intent, creative_brief, style_dna)
        if not self.router:
            return heuristic
        try:
            prompt = self._build_prompt(payload, intent, creative_brief, style_dna, heuristic)
            ai_data = self.router.call_small('asset_intent', prompt, response_schema=_RESPONSE_SCHEMA)
        except Exception:  # noqa: BLE001
            logger.exception('AssetIntentClassifier: AI-Refinement fehlgeschlagen')
            return heuristic
        if not isinstance(ai_data, dict):
            return heuristic
        result = dict(heuristic)
        if isinstance(ai_data.get('needs_custom_assets'), bool):
            result['needs_custom_assets'] = ai_data['needs_custom_assets']
        if ai_data.get('asset_complexity') in ('low', 'medium', 'high'):
            result['asset_complexity'] = ai_data['asset_complexity']
        if isinstance(ai_data.get('asset_categories'), list):
            result['asset_categories'] = [
                str(x) for x in ai_data['asset_categories'] if isinstance(x, (str, int))
            ][:8]
        if isinstance(ai_data.get('hero_assets_needed'), bool):
            result['hero_assets_needed'] = ai_data['hero_assets_needed']
        if isinstance(ai_data.get('estimated_asset_count'), int):
            result['estimated_asset_count'] = max(0, min(12, ai_data['estimated_asset_count']))
        if isinstance(ai_data.get('notes'), str):
            result['notes'] = ai_data['notes'][:280]
        return result

    def _heuristic(
        self,
        payload: dict[str, Any],
        intent: dict[str, Any] | None,
        creative_brief: dict[str, Any] | None,
        style_dna: dict[str, Any] | None,
    ) -> dict[str, Any]:
        prompt = (payload or {}).get('prompt') or ''
        topic = (payload or {}).get('topic') or ''
        title = (payload or {}).get('title') or ''
        subject = (payload or {}).get('subject') or ''
        grade = (payload or {}).get('grade') or ''
        full = ' '.join(str(x) for x in (prompt, topic, title, subject, grade) if x)

        figure_count = len(_FIGURE_WORDS.findall(full))
        has_scene = bool(_SCENE_WORDS.search(full))
        has_boring = bool(_BORING_WORDS.search(full))

        intent = intent or {}
        kind = (intent.get('board_kind') or '').lower()
        grade_band = (intent.get('grade_band') or '').lower()
        is_primary = grade_band == 'primary' or any(
            tag in (grade or '').lower() for tag in ('1', '2', '3', '4', 'grundschule', 'primary')
        )

        if kind == 'map' or 'grenzkarte' in full.lower():
            return {
                'needs_custom_assets': False,
                'asset_complexity': 'low',
                'asset_categories': [],
                'hero_assets_needed': False,
                'estimated_asset_count': 0,
                'notes': 'Karte/Grenzen — Map-/Dataset-System statt freier Assets.',
            }

        if has_boring and figure_count == 0 and not has_scene:
            return {
                'needs_custom_assets': False,
                'asset_complexity': 'low',
                'asset_categories': ['icon'],
                'hero_assets_needed': False,
                'estimated_asset_count': 0,
                'notes': 'Sachliches Board — keine Custom-Figuren.',
            }

        categories: list[str] = []
        if figure_count >= 1:
            categories.append('mascot')
        if has_scene:
            categories.append('background_layer')
            categories.append('scene_object')
        if is_primary or 'grundschule' in full.lower():
            if 'badge' not in categories:
                categories.append('badge')
            if 'sticker' not in categories:
                categories.append('sticker')
        if not categories:
            categories.append('icon')

        complexity = 'low'
        if figure_count >= 2 or has_scene:
            complexity = 'medium'
        if figure_count >= 3 and has_scene:
            complexity = 'high'

        estimated = min(8, max(2, figure_count + (2 if has_scene else 0)))

        return {
            'needs_custom_assets': True,
            'asset_complexity': complexity,
            'asset_categories': categories,
            'hero_assets_needed': figure_count >= 1,
            'estimated_asset_count': estimated,
            'notes': '',
        }

    def _build_prompt(
        self,
        payload: dict[str, Any],
        intent: dict[str, Any] | None,
        creative_brief: dict[str, Any] | None,
        style_dna: dict[str, Any] | None,
        heuristic: dict[str, Any],
    ) -> str:
        return (
            'Du bist ein Asset-Intent-Klassifizierer für Boards.\n'
            'Antworte ausschließlich als valides JSON nach Schema.\n'
            f'Lehrerprompt: {payload.get("prompt", "")[:500]}\n'
            f'Fach: {payload.get("subject")}\n'
            f'Klasse: {payload.get("grade")}\n'
            f'Thema: {payload.get("topic")}\n'
            f'Intent: {intent or {}}\n'
            f'Creative Brief (kompakt): {(creative_brief or {}).get("board_goal", "")[:200]}\n'
            f'Style DNA Mood: {(style_dna or {}).get("mood", "")}\n'
            f'Heuristik-Vorschlag: {heuristic}\n'
            'Regeln:\n'
            '- Karten/historische Grenzen: needs_custom_assets=false.\n'
            '- Sachliche Diagramme: needs_custom_assets=false.\n'
            '- Eigene Figuren/Tiere/Szenen: needs_custom_assets=true.\n'
            '- estimated_asset_count <= 8.\n'
        )
