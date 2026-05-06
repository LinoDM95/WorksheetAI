"""Asset Quality Judge.

Heuristik-Scoring (0–100) anhand von:
- Validation-Errors (harte Abzüge)
- Pfadanzahl (zu wenig → unfertig, zu viel → überladen)
- Farbanzahl (Style-Konformität)
- Background-Mode-Konformität
- Title/Desc (Accessibility)
- Style-Family-Pass (basics)

Vision-Hook (multimodal) ist als TODO dokumentiert: ``judge_with_vision``.
Wenn ``router`` gesetzt ist und Vision-Settings aktiv sind, wird ein optionaler
Mini-LLM-Call für eine textuelle Begründung gemacht.
"""

from __future__ import annotations

import logging
from typing import Any

from .svg_validation import validate_svg


logger = logging.getLogger(__name__)


_VISION_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'rating': {'type': 'integer'},
        'critique': {'type': 'string'},
        'suggested_repair': {
            'type': 'string',
            'enum': [
                'fix_validation', 'improve_proportions', 'improve_style_fit', 'simplify',
                'improve_child_friendliness', 'fix_background_mode', 'improve_color_harmony',
                'none',
            ],
        },
    },
    'required': ['rating'],
}


class AssetQualityJudge:
    """Bewertet ein einzelnes Asset (SVG) und vergibt einen Quality Score 0–100."""

    def __init__(self, *, router=None) -> None:
        self.router = router

    def evaluate(
        self,
        svg: str,
        *,
        asset_type: str = '',
        background_mode: str = 'transparent_cutout',
        style_family: str = '',
        palette_size: int = 5,
    ) -> dict[str, Any]:
        validation = validate_svg(svg, background_mode=background_mode, asset_type=asset_type)
        score = 100.0
        suggested_repair = 'none'
        breakdown: dict[str, float] = {}

        if not validation.ok:
            score -= 35
            suggested_repair = 'fix_validation'
        breakdown['validation_pass'] = 1.0 if validation.ok else 0.0

        # Pfadanzahl
        paths = int(validation.metrics.get('paths', 0))
        if paths == 0 and asset_type not in ('frame', 'badge'):
            score -= 15
            suggested_repair = 'simplify' if suggested_repair == 'none' else suggested_repair
        elif paths > 80:
            score -= 8
        elif paths >= 1:
            breakdown['paths_ok'] = 1.0

        # Farben
        colors = int(validation.metrics.get('colors', 0))
        max_allowed = max(3, palette_size + 2)
        if colors > max_allowed * 2:
            score -= 12
            if suggested_repair == 'none':
                suggested_repair = 'improve_color_harmony'
        elif colors == 0:
            score -= 6
        breakdown['color_count'] = float(colors)

        # Title/Desc
        if not validation.metrics.get('has_title'):
            score -= 4
        if not validation.metrics.get('has_desc'):
            score -= 3

        # Background-Mode
        bg_warning = any('background' in w.lower() for w in validation.warnings)
        if bg_warning:
            score -= 8
            if suggested_repair == 'none':
                suggested_repair = 'fix_background_mode'

        # Soft warnings
        score -= min(10, len(validation.warnings))

        score = max(0.0, min(100.0, score))
        ai_critique: dict[str, Any] = {}
        if self.router:
            try:
                ai_critique = self._call_judge(svg, asset_type, background_mode, style_family)
                rating = ai_critique.get('rating')
                if isinstance(rating, int):
                    score = max(0.0, min(100.0, (score + float(rating)) / 2.0))
                proposed = ai_critique.get('suggested_repair')
                if isinstance(proposed, str) and proposed != 'none':
                    suggested_repair = proposed
            except Exception:  # noqa: BLE001
                logger.exception('AssetQualityJudge: AI-Hook fehlgeschlagen')

        return {
            'score': round(score, 1),
            'suggested_repair': suggested_repair,
            'errors': validation.errors,
            'warnings': validation.warnings,
            'metrics': validation.metrics,
            'breakdown': breakdown,
            'ai_critique': ai_critique.get('critique') or '',
        }

    def _call_judge(self, svg: str, asset_type: str, bg_mode: str, family: str) -> dict[str, Any]:
        # Wir senden bewusst keine Bilddaten — Vision ist ein TODO-Hook.
        prompt = (
            'Du bist Asset-QA. Bewerte das folgende SVG strukturell (rating 0–100). '
            'Antwort JSON nach Schema. Kein Code-Output, nur Critique + Repair-Hinweis.\n'
            f'asset_type: {asset_type}, background_mode: {bg_mode}, style_family: {family}\n'
            f'svg (gekürzt): {svg[:6000]}'
        )
        return self.router.call_small('asset_quality_judge', prompt, response_schema=_VISION_SCHEMA) or {}


# TODO: Vision-Pfad (multimodaler Aufruf mit gerendertem PNG) integrieren, sobald
# Provider-Multi-Modal-API standardisiert ist.
def judge_with_vision(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    """Stub: erwartet später ``png_bytes`` + Asset-Kontext, liefert Vision-Rating."""
    return {'ok': False, 'warning': 'vision_judge_not_implemented'}
