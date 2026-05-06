"""SVG Free Draw — generiert custom SVG-Assets via großem KI-Modell.

Output-Schema (vom Provider erwartet)::

    {
      "svg": "<svg ...>...</svg>",
      "notes": "kurze Erklärung der Designentscheidungen",
      "used_style_rules": ["..."],
      "warnings": ["..."]
    }

Ohne KI (z. B. Mock oder fehlender Provider) wird ein Fallback-Procedural-SVG
erzeugt, damit die Pipeline nicht crasht.
"""

from __future__ import annotations

import logging
from typing import Any

from . import procedural_generators
from .asset_style import design_tokens_from_dna, palette_from_dna


logger = logging.getLogger(__name__)


_RESPONSE_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'svg': {'type': 'string'},
        'notes': {'type': 'string'},
        'used_style_rules': {'type': 'array', 'items': {'type': 'string'}},
        'warnings': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['svg'],
}


class SvgFreeDrawService:
    """Erzeugt SVG-Assets via großem Modell. Fallback: prozedural."""

    def __init__(self, *, router=None) -> None:
        self.router = router

    def generate(
        self,
        asset_request: dict[str, Any],
        *,
        style_family: str = '',
        palette: dict[str, str] | None = None,
        design_tokens: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.router:
            return self._fallback(asset_request, palette=palette, design_tokens=design_tokens)

        prompt = self._build_prompt(asset_request, style_family, palette or {}, design_tokens or {})
        try:
            data = self.router.call_large(
                'asset_svg_generation',
                prompt,
                response_schema=_RESPONSE_SCHEMA,
                temperature=0.45,
            )
        except Exception:  # noqa: BLE001
            logger.exception('SvgFreeDrawService: Modell-Aufruf fehlgeschlagen')
            return self._fallback(asset_request, palette=palette, design_tokens=design_tokens, used_fallback=True)

        if not isinstance(data, dict) or not isinstance(data.get('svg'), str) or not data['svg'].strip():
            return self._fallback(asset_request, palette=palette, design_tokens=design_tokens, used_fallback=True)

        return {
            'svg': data['svg'].strip(),
            'notes': str(data.get('notes') or '')[:500],
            'used_style_rules': [str(r) for r in (data.get('used_style_rules') or []) if isinstance(r, str)][:12],
            'warnings': [str(w) for w in (data.get('warnings') or []) if isinstance(w, str)][:8],
            'source': 'svg_free_draw',
        }

    def _build_prompt(
        self,
        asset_request: dict[str, Any],
        style_family: str,
        palette: dict[str, str],
        design_tokens: dict[str, Any],
    ) -> str:
        return (
            'Du bist SVG-Illustrator für Grundschul-/Sekundarstufen-Boards.\n'
            'Erzeuge ein einzelnes valides, sauberes SVG (keine HTML-Wrapper, kein script).\n'
            'Antworte ausschließlich als JSON nach Schema.\n'
            f'Asset: {asset_request}\n'
            f'Style Family: {style_family}\n'
            f'Palette: {palette}\n'
            f'Design Tokens: {design_tokens}\n'
            'Regeln:\n'
            '- Genau ein <svg>-Root, mit viewBox 0 0 512 512.\n'
            '- KEIN <script>, KEIN foreignObject, KEINE on*-Eventhandler.\n'
            '- KEINE externen URLs (kein https:, kein data:).\n'
            '- Title + Desc setzen (Accessibility).\n'
            '- Stroke-Width / Outline-Color aus design_tokens.\n'
            '- Konsistent zur Style Family (keine fremden Stile mischen).\n'
            '- Maximal die Farben aus der Palette (+ Black/White) verwenden.\n'
            '- Keine Photo-Realistik, keine Texturen.\n'
        )

    def _fallback(
        self,
        asset_request: dict[str, Any],
        *,
        palette: dict[str, str] | None,
        design_tokens: dict[str, Any] | None,
        used_fallback: bool = False,
    ) -> dict[str, Any]:
        key = (asset_request.get('key') or asset_request.get('subject_text') or 'sticker_frame').lower()
        result = procedural_generators.render(
            key,
            palette=palette or palette_from_dna({}),
            design_tokens=design_tokens or design_tokens_from_dna({}),
        )
        if not result:
            result = procedural_generators.render(
                'sticker_frame',
                palette=palette or palette_from_dna({}),
                design_tokens=design_tokens or design_tokens_from_dna({}),
            )
        warnings = ['svg_free_draw_unavailable_fallback_used'] if used_fallback else ['no_router_fallback_used']
        return {
            'svg': (result or {}).get('svg') or '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"></svg>',
            'notes': 'Fallback-Procedural — KI-Aufruf nicht verfügbar.',
            'used_style_rules': [],
            'warnings': warnings,
            'source': 'fallback_procedural',
        }
