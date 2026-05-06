"""Asset Repair Agent — KI-gestützte SVG-Reparatur.

Modi (vom Quality Judge oder vom Aufrufer gewählt):
- ``fix_validation``           — Hardcrash-Probleme beheben (script, foreignObject, externe URLs ...)
- ``improve_proportions``      — Proportionen verbessern (Kopf/Körper, Augenabstand)
- ``improve_style_fit``        — Stil zur Style Family angleichen
- ``simplify``                 — überladenes SVG vereinfachen
- ``improve_child_friendliness`` — freundlichere Augen/Mund/Farben
- ``fix_background_mode``      — transparent_cutout vs. full_background korrigieren
- ``improve_color_harmony``    — Palette-Reduktion + Konformität

Wenn keine KI verfügbar ist, fällt der Agent auf eine konservative
Normalizer-Operation zurück (svg_normalizer entfernt Hardcrash-Probleme).
"""

from __future__ import annotations

import logging
from typing import Any

from .svg_normalizer import normalize_svg


logger = logging.getLogger(__name__)


SUPPORTED_MODES = (
    'fix_validation',
    'improve_proportions',
    'improve_style_fit',
    'simplify',
    'improve_child_friendliness',
    'fix_background_mode',
    'improve_color_harmony',
)


_RESPONSE_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'svg': {'type': 'string'},
        'notes': {'type': 'string'},
        'changes': {'type': 'array', 'items': {'type': 'string'}},
        'warnings': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['svg'],
}


_MODE_DIRECTIVES = {
    'fix_validation': (
        'Behebe Validierungs-Blocker: keine <script>, kein <foreignObject>, keine on*-Handler, '
        'keine externen URLs/data:-URLs, ergänze viewBox + xmlns + title + desc.'
    ),
    'improve_proportions': (
        'Verbessere Proportionen: freundliche Anatomie, klare Größenverhältnisse, '
        'symmetrische Augenabstände, ausgewogene Komposition.'
    ),
    'improve_style_fit': (
        'Passe das SVG strikt an die genannte Style Family und die Design Tokens an: '
        'Stroke-Width, Outline-Color, Form-Sprache (rund/eckig), Schattenstil.'
    ),
    'simplify': (
        'Reduziere die Anzahl der Pfade & Farben deutlich. Behalte die Kernform — entferne Detail-Spam, '
        'unnötige Filter, Dekoflächen.'
    ),
    'improve_child_friendliness': (
        'Mache das Asset für Grundschüler:innen freundlicher: größere runde Augen, weiche Konturen, '
        'fröhliche Mundkurve, höhere Sättigung in der Palette.'
    ),
    'fix_background_mode': (
        'Korrigiere den Background-Mode: transparent_cutout darf KEIN vollflächiges Rechteck haben; '
        'full_background braucht ein vollflächiges Hintergrund-Element.'
    ),
    'improve_color_harmony': (
        'Reduziere die Palette auf die maximal erlaubten Farben aus den Design Tokens. '
        'Sorge für komplementäre Akzente, kein Neon, keine zu hohe Sättigung im Hintergrund.'
    ),
}


class AssetRepairAgent:
    """Repariert SVGs gezielt (Mode-basiert) — KI-Pfad mit konservativem Fallback."""

    def __init__(self, *, router=None) -> None:
        self.router = router

    def repair(
        self,
        svg: str,
        *,
        mode: str,
        asset_request: dict[str, Any],
        style_family: str = '',
        palette: dict[str, str] | None = None,
        design_tokens: dict[str, Any] | None = None,
        critique: str = '',
        validation_errors: list[str] | None = None,
        validation_warnings: list[str] | None = None,
    ) -> dict[str, Any]:
        if mode not in SUPPORTED_MODES:
            mode = 'fix_validation'

        if not self.router:
            return self._fallback(svg, asset_request, mode)

        try:
            prompt = self._build_prompt(
                svg, mode=mode, asset_request=asset_request, style_family=style_family,
                palette=palette or {}, design_tokens=design_tokens or {},
                critique=critique, errors=validation_errors or [], warnings=validation_warnings or [],
            )
            data = self.router.call_large(
                'asset_repair', prompt,
                response_schema=_RESPONSE_SCHEMA,
                temperature=0.35,
            )
        except Exception:  # noqa: BLE001
            logger.exception('AssetRepairAgent: KI-Reparatur fehlgeschlagen (mode=%s)', mode)
            return self._fallback(svg, asset_request, mode, used_fallback=True)

        if not isinstance(data, dict) or not isinstance(data.get('svg'), str) or not data['svg'].strip():
            return self._fallback(svg, asset_request, mode, used_fallback=True)

        return {
            'svg': data['svg'].strip(),
            'mode': mode,
            'notes': str(data.get('notes') or '')[:500],
            'changes': [str(c) for c in (data.get('changes') or []) if isinstance(c, str)][:12],
            'warnings': [str(w) for w in (data.get('warnings') or []) if isinstance(w, str)][:8],
            'source': 'ai',
        }

    def _build_prompt(
        self, svg: str, *, mode: str,
        asset_request: dict[str, Any], style_family: str,
        palette: dict[str, str], design_tokens: dict[str, Any],
        critique: str, errors: list[str], warnings: list[str],
    ) -> str:
        directive = _MODE_DIRECTIVES.get(mode, _MODE_DIRECTIVES['fix_validation'])
        return (
            'Du bist Asset Repair Agent für Bildungs-SVGs. Antworte JSON nach Schema. '
            'Liefere ausschließlich ein gültiges, sicheres SVG zurück (kein <script>, '
            'kein foreignObject, keine externen URLs).\n'
            f'Mode: {mode}\n'
            f'Direktive: {directive}\n'
            f'Asset-Anforderung: {asset_request}\n'
            f'Style Family: {style_family}\n'
            f'Palette: {palette}\n'
            f'Design Tokens: {design_tokens}\n'
            f'Critique: {critique}\n'
            f'Validation-Errors: {errors}\n'
            f'Validation-Warnings: {warnings}\n'
            f'Ursprungs-SVG (ggf. gekürzt):\n{svg[:8000]}\n'
            'Gib das verbesserte SVG zurück. Behalte die Kernform/das Motiv. Keine neuen Inhalte erfinden.\n'
        )

    def _fallback(
        self,
        svg: str,
        asset_request: dict[str, Any],
        mode: str,
        *,
        used_fallback: bool = False,
    ) -> dict[str, Any]:
        normalized = normalize_svg(
            svg,
            title=asset_request.get('title') or asset_request.get('key'),
            description=asset_request.get('subject_text') or '',
            id_prefix=str(asset_request.get('key') or 'asset'),
        )
        warning = 'ai_repair_fallback_used' if used_fallback else 'no_router_fallback'
        return {
            'svg': normalized,
            'mode': mode,
            'notes': 'Repair-Fallback: nur Normalizer angewandt (keine semantische Reparatur).',
            'changes': ['normalizer_applied'],
            'warnings': [warning],
            'source': 'fallback_normalizer',
        }
