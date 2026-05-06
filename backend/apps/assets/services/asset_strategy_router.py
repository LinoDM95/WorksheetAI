"""Asset Strategy Router.

Wählt pro Asset die beste Strategie (compiler / procedural / template_remix /
svg_free_draw / asset_library / fallback_simple) auf Basis von Heuristik
und optionalem KI-Refinement durch das kleine Modell.

Heuristik:
- Mascot/Animal/Character + cute Style → ``compiler``
- Sonne, Wolke, Stern, Pfeil, Badge, Frame, Pattern → ``procedural``
- Haus, Baum, Buch, Calculator-Icon, einfache Icons → ``template_remix``
- Karten/Grenzen → niemals ``svg_free_draw`` (immer ``fallback_simple`` mit Warnung)
- alles andere komplexe → ``svg_free_draw``
"""

from __future__ import annotations

import logging
from typing import Any

from .procedural_generators import GENERATOR_ALIASES, GENERATORS
from .mascot_compiler import SUPPORTED_SPECIES


logger = logging.getLogger(__name__)


_PROCEDURAL_KEYS = set(GENERATORS.keys()) | set(GENERATOR_ALIASES.keys())
_MASCOT_KEYS = {*SUPPORTED_SPECIES, 'mascot', 'character', 'animal', 'tier', 'figur'}
_TEMPLATE_KEYS = {
    'house', 'simple_house', 'haus',
    'tree', 'simple_tree', 'baum',
    'book', 'buch', 'calculator', 'rechner',
    'icon', 'card', 'karte_ui',
}
_MAP_KEYS = {'map', 'karte', 'grenze', 'border', 'territorium', 'reich', 'staat'}
_BACKGROUND_KEYS = {'background', 'hintergrund', 'bg', 'meadow', 'wiese', 'water', 'wasser', 'sky', 'himmel'}


_RESPONSE_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'strategy': {
            'type': 'string',
            'enum': ['compiler', 'procedural', 'template_remix', 'svg_free_draw',
                     'asset_library', 'fallback_simple'],
        },
        'reason': {'type': 'string'},
        'estimated_cost_level': {'type': 'string', 'enum': ['low', 'medium', 'high']},
        'qa_required': {'type': 'boolean'},
        'variants_recommended': {'type': 'integer'},
    },
    'required': ['strategy'],
}


class AssetStrategyRouter:
    """Heuristisches Routing + optionales KI-Refinement."""

    def __init__(self, *, router=None) -> None:
        self.router = router  # Optional: SmartboardAIModelRouter

    def decide(self, asset: dict[str, Any]) -> dict[str, Any]:
        """Liefert Strategie + Begleitdaten für ein einzelnes geplantes Asset."""

        heuristic = self._heuristic(asset)
        if not self.router:
            return heuristic
        try:
            prompt = self._build_prompt(asset, heuristic)
            ai_data = self.router.call_small('asset_strategy', prompt, response_schema=_RESPONSE_SCHEMA)
        except Exception:  # noqa: BLE001 — fail-soft
            logger.exception('AssetStrategyRouter: AI-Refinement fehlgeschlagen')
            return heuristic
        if not isinstance(ai_data, dict) or not ai_data.get('strategy'):
            return heuristic
        result = dict(heuristic)
        # Wir akzeptieren KI-Override nur, wenn die Strategie zulässig ist und nicht maps verletzt.
        proposed = str(ai_data.get('strategy')).strip().lower()
        if proposed in {'compiler', 'procedural', 'template_remix', 'svg_free_draw',
                        'asset_library', 'fallback_simple'}:
            if heuristic.get('strategy') == 'fallback_simple' and self._is_map(asset):
                # Karten dürfen nicht hochgestuft werden.
                pass
            else:
                result['strategy'] = proposed
        if isinstance(ai_data.get('reason'), str):
            result['reason'] = ai_data['reason'][:280]
        if ai_data.get('estimated_cost_level') in ('low', 'medium', 'high'):
            result['estimated_cost_level'] = ai_data['estimated_cost_level']
        if isinstance(ai_data.get('qa_required'), bool):
            result['qa_required'] = ai_data['qa_required']
        if isinstance(ai_data.get('variants_recommended'), int):
            result['variants_recommended'] = max(1, min(4, ai_data['variants_recommended']))
        return result

    def _heuristic(self, asset: dict[str, Any]) -> dict[str, Any]:
        key = (asset.get('key') or '').strip().lower()
        atype = (asset.get('asset_type') or '').strip().lower()
        subject = (asset.get('subject_text') or '').strip().lower()
        priority = (asset.get('priority') or 'medium').strip().lower()
        bg_mode = (asset.get('background_mode') or '').strip().lower()

        blob = ' '.join([key, atype, subject])

        is_hero = priority == 'hero'

        if self._is_map(asset):
            return {
                'strategy': 'fallback_simple',
                'reason': 'Karten/Grenzen dürfen nicht frei generiert werden — Dataset/Map-System verwenden.',
                'estimated_cost_level': 'low',
                'qa_required': True,
                'variants_recommended': 1,
            }

        if any(k in blob for k in _MASCOT_KEYS) or atype in {'mascot', 'character', 'animal'}:
            return {
                'strategy': 'compiler',
                'reason': 'Mascot/Charakter via Compiler-Kit.',
                'estimated_cost_level': 'low',
                'qa_required': True,
                'variants_recommended': 3 if is_hero else 1,
            }

        if any(k in blob for k in _PROCEDURAL_KEYS) or atype in {'arrow', 'badge', 'pattern', 'frame', 'marker'}:
            return {
                'strategy': 'procedural',
                'reason': 'Standardform — prozedural ohne KI erzeugbar.',
                'estimated_cost_level': 'low',
                'qa_required': False,
                'variants_recommended': 1,
            }

        if any(k in blob for k in _TEMPLATE_KEYS) or atype == 'icon':
            return {
                'strategy': 'template_remix',
                'reason': 'Bekanntes Objekt — Template-Remix bevorzugt.',
                'estimated_cost_level': 'low',
                'qa_required': True,
                'variants_recommended': 1,
            }

        if bg_mode == 'full_background' or any(k in blob for k in _BACKGROUND_KEYS):
            return {
                'strategy': 'svg_free_draw',
                'reason': 'Hintergrund/komplexe Szene — SVG Free Draw mit klaren Style-Tokens.',
                'estimated_cost_level': 'medium',
                'qa_required': True,
                'variants_recommended': 1,
            }

        return {
            'strategy': 'svg_free_draw',
            'reason': 'Individuelles Asset ohne passenden Compiler/Template — SVG Free Draw.',
            'estimated_cost_level': 'medium',
            'qa_required': True,
            'variants_recommended': 2 if is_hero else 1,
        }

    def _is_map(self, asset: dict[str, Any]) -> bool:
        atype = (asset.get('asset_type') or '').strip().lower()
        key = (asset.get('key') or '').strip().lower()
        subject = (asset.get('subject_text') or '').strip().lower()
        if atype in {'map', 'historical_map'}:
            return True
        return any(k in (subject + ' ' + key) for k in _MAP_KEYS)

    def _build_prompt(self, asset: dict[str, Any], heuristic: dict[str, Any]) -> str:
        return (
            'Du bist Asset Strategy Router. Antworte ausschließlich als JSON nach Schema.\n'
            f'Asset: {asset}\n'
            f'Heuristik: {heuristic}\n'
            'Wähle die geeignetste Strategie. Erlaubt: compiler, procedural, template_remix, '
            'svg_free_draw, asset_library, fallback_simple.\n'
            'Karten/historische Grenzen NIEMALS svg_free_draw.\n'
            'Hero-Mascot bevorzugt 2–3 Varianten.\n'
            'Sonne/Wolke/Stern/Pfeil bevorzugt procedural.\n'
        )
