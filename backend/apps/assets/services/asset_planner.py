"""Asset Planner.

Erzeugt aus Lehrerprompt + Creative Brief + Style DNA + Intent einen
Asset Plan (Liste planbarer Assets, Style Family, Palette, Design Tokens).
Heuristik + KI-Refinement durch das kleine Modell.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from django.conf import settings

from . import asset_style
from .procedural_generators import GENERATOR_ALIASES, list_generators


logger = logging.getLogger(__name__)


_RESPONSE_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'asset_pack_name': {'type': 'string'},
        'style_family': {'type': 'string'},
        'palette': {'type': 'object'},
        'design_tokens': {'type': 'object'},
        'assets': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'key': {'type': 'string'},
                    'title': {'type': 'string'},
                    'asset_type': {'type': 'string'},
                    'subject_text': {'type': 'string'},
                    'role': {'type': 'string'},
                    'priority': {'type': 'string', 'enum': ['low', 'medium', 'high', 'hero']},
                    'background_mode': {'type': 'string'},
                    'preferred_strategy': {'type': 'string'},
                    'placement_hint': {'type': 'string'},
                    'required': {'type': 'boolean'},
                    'style_notes': {'type': 'string'},
                    'interaction_notes': {'type': 'string'},
                    'tags': {'type': 'array', 'items': {'type': 'string'}},
                    'generation_mode': {
                        'type': 'string',
                        'enum': ['inline_in_board', 'asset_engine'],
                    },
                },
                'required': ['key', 'title', 'asset_type'],
            },
        },
    },
    'required': ['asset_pack_name', 'style_family', 'assets'],
}


# Heuristisches Inhaltsmapping: erkennt einfache Schlüsselwörter im Lehrerprompt.
_NOUN_RE = re.compile(
    r'\b('
    r'b(?:är|aer)|hase|fuchs|monster|alien|drache|katze|hund|tier|maskottchen|figur|charakter|'
    r'sonne|wolke|stern|mond|pfeil|haus|baum|wiese|wasser|regen|tropfen|sprechblase|'
    r'forscher|astronaut|pirat|ritter|prinzessin'
    r')\b',
    re.IGNORECASE,
)


_TYPE_MAP = {
    'bär': ('bear_mascot', 'mascot', 'compiler', 'transparent_cutout', 'hero', 'Freundlicher Bär'),
    'baer': ('bear_mascot', 'mascot', 'compiler', 'transparent_cutout', 'hero', 'Freundlicher Bär'),
    'hase': ('rabbit_mascot', 'mascot', 'compiler', 'transparent_cutout', 'high', 'Hase als Mascot'),
    'fuchs': ('fox_mascot', 'mascot', 'compiler', 'transparent_cutout', 'high', 'Fuchs als Mascot'),
    'monster': ('monster_mascot', 'mascot', 'compiler', 'transparent_cutout', 'hero', 'Freundliches Monster'),
    'alien': ('alien_mascot', 'mascot', 'compiler', 'transparent_cutout', 'high', 'Alien-Mascot'),
    'drache': ('dragon_mascot', 'character', 'svg_free_draw', 'transparent_cutout', 'hero', 'Stilisierter Drache'),
    'katze': ('cat_mascot', 'animal', 'compiler', 'transparent_cutout', 'high', 'Niedliche Katze'),
    'hund': ('dog_mascot', 'animal', 'compiler', 'transparent_cutout', 'high', 'Niedlicher Hund'),
    'tier': ('animal_mascot', 'animal', 'compiler', 'transparent_cutout', 'medium', 'Tier-Figur'),
    'maskottchen': ('hero_mascot', 'mascot', 'compiler', 'transparent_cutout', 'hero', 'Hero-Mascot'),
    'figur': ('character', 'character', 'svg_free_draw', 'transparent_cutout', 'medium', 'Charakter'),
    'charakter': ('character', 'character', 'svg_free_draw', 'transparent_cutout', 'medium', 'Charakter'),
    'sonne': ('sun', 'scene_object', 'procedural', 'transparent_cutout', 'low', 'Stilisierte Sonne'),
    'wolke': ('cloud', 'scene_object', 'procedural', 'transparent_cutout', 'low', 'Wolke'),
    'stern': ('star', 'decorative', 'procedural', 'transparent_cutout', 'low', 'Stern'),
    'mond': ('moon', 'scene_object', 'procedural', 'transparent_cutout', 'low', 'Mond'),
    'pfeil': ('arrow', 'arrow', 'procedural', 'transparent_cutout', 'low', 'Richtungspfeil'),
    'haus': ('house', 'scene_object', 'template_remix', 'transparent_cutout', 'medium', 'Einfaches Haus'),
    'baum': ('tree', 'scene_object', 'template_remix', 'transparent_cutout', 'medium', 'Stilisierter Baum'),
    'wiese': ('meadow_background', 'background_layer', 'procedural', 'full_background', 'medium', 'Wiese mit Himmel'),
    'wasser': ('water_wave', 'background_layer', 'procedural', 'full_background', 'medium', 'Wasserwellen'),
    'regen': ('raindrop', 'decorative', 'procedural', 'transparent_cutout', 'low', 'Regentropfen'),
    'tropfen': ('raindrop', 'decorative', 'procedural', 'transparent_cutout', 'low', 'Regentropfen'),
    'sprechblase': ('speech_bubble', 'frame', 'procedural', 'overlay_frame', 'low', 'Sprechblase'),
    'forscher': ('researcher_character', 'character', 'svg_free_draw', 'transparent_cutout', 'high', 'Forschende Figur'),
    'astronaut': ('astronaut_character', 'character', 'svg_free_draw', 'transparent_cutout', 'high', 'Astronaut-Figur'),
    'pirat': ('pirate_character', 'character', 'svg_free_draw', 'transparent_cutout', 'high', 'Piraten-Figur'),
    'ritter': ('knight_character', 'character', 'svg_free_draw', 'transparent_cutout', 'high', 'Ritter-Figur'),
    'prinzessin': ('princess_character', 'character', 'svg_free_draw', 'transparent_cutout', 'high', 'Prinzessin-Figur'),
}


class AssetPlanner:
    """Erstellt einen ``CompositionPlan`` für die Asset-Engine."""

    def __init__(self, *, router=None) -> None:
        self.router = router

    def plan(
        self,
        payload: dict[str, Any],
        intent: dict[str, Any] | None = None,
        risk: dict[str, Any] | None = None,
        creative_brief: dict[str, Any] | None = None,
        style_dna: dict[str, Any] | None = None,
        intent_classification: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        heuristic = self._heuristic(payload, intent, risk, creative_brief, style_dna, intent_classification)
        if not self.router:
            return heuristic
        try:
            prompt = self._build_prompt(payload, intent, creative_brief, style_dna, heuristic)
            ai_data = self.router.call_small('asset_plan', prompt, response_schema=_RESPONSE_SCHEMA)
        except Exception:  # noqa: BLE001
            logger.exception('AssetPlanner: AI-Refinement fehlgeschlagen')
            return heuristic
        if not isinstance(ai_data, dict) or not isinstance(ai_data.get('assets'), list):
            return heuristic
        merged = dict(heuristic)
        if isinstance(ai_data.get('asset_pack_name'), str) and ai_data['asset_pack_name'].strip():
            merged['asset_pack_name'] = ai_data['asset_pack_name'].strip()[:120]
        if isinstance(ai_data.get('style_family'), str) and asset_style.get_style_family(ai_data['style_family']):
            merged['style_family'] = ai_data['style_family'].strip().lower()
        if isinstance(ai_data.get('palette'), dict):
            merged['palette'] = {**merged.get('palette', {}), **{
                k: v for k, v in ai_data['palette'].items() if isinstance(v, str)
            }}
        if isinstance(ai_data.get('design_tokens'), dict):
            merged['design_tokens'] = {**merged.get('design_tokens', {}), **ai_data['design_tokens']}
        merged['assets'] = self._merge_asset_lists(heuristic.get('assets') or [], ai_data['assets'])
        return merged

    @staticmethod
    def _generation_mode_for(*, strategy: str, priority: str, background_mode: str) -> str:
        if not getattr(settings, 'ASSET_INLINE_SIMPLE_IN_BOARD_HTML', True):
            return 'asset_engine'
        if (priority or '').lower() in ('hero', 'high') or (background_mode or '').lower() == 'full_background':
            return 'asset_engine'
        st = (strategy or '').lower()
        if st in ('compiler', 'svg_free_draw', 'asset_library'):
            return 'asset_engine'
        if st in ('procedural', 'template_remix', 'fallback_simple'):
            return 'inline_in_board'
        return 'asset_engine'

    def _heuristic(
        self,
        payload: dict[str, Any],
        intent: dict[str, Any] | None,
        risk: dict[str, Any] | None,
        creative_brief: dict[str, Any] | None,
        style_dna: dict[str, Any] | None,
        intent_classification: dict[str, Any] | None,
    ) -> dict[str, Any]:
        title = (payload or {}).get('title') or (payload or {}).get('topic') or 'Board'
        topic = (payload or {}).get('topic') or ''
        prompt_text = (payload or {}).get('prompt') or ''
        full = ' '.join(str(x).lower() for x in (prompt_text, topic, title) if x)

        # Lehrkraft-Override: explizite Asset-Style-Family aus Payload (außer 'auto').
        explicit_family = str((payload or {}).get('asset_style_family') or '').strip().lower()
        if explicit_family and explicit_family != 'auto' and asset_style.get_style_family(explicit_family):
            family = explicit_family
        else:
            family = asset_style.style_family_from_dna(style_dna)
        palette = asset_style.palette_from_dna(style_dna)
        design_tokens = asset_style.design_tokens_from_dna(style_dna, family)

        assets: list[dict[str, Any]] = []
        seen_keys: set[str] = set()
        max_assets = int(getattr(settings, 'ASSET_MAX_ASSETS_PER_PACK', 8))

        # Erkenne explizite Subjekte aus Lehrerprompt.
        for match in _NOUN_RE.finditer(full):
            key_word = match.group(1).lower()
            mapping = _TYPE_MAP.get(key_word)
            if not mapping:
                continue
            key, asset_type, strategy, bg_mode, priority, title_de = mapping
            if key in seen_keys:
                continue
            seen_keys.add(key)
            assets.append(self._asset_spec(
                key=key, title=title_de, asset_type=asset_type,
                subject_text=key_word, strategy=strategy,
                priority=priority, background_mode=bg_mode,
            ))
            if len(assets) >= max_assets:
                break

        # Sticker/Badge bei Grundschule, falls noch Platz.
        grade_band = ((intent or {}).get('grade_band') or '').lower()
        is_primary = grade_band == 'primary' or any(
            t in (payload or {}).get('grade', '').lower() for t in ('grundschule', 'primary', '1', '2', '3', '4')
        )
        if is_primary and len(assets) < max_assets:
            if 'sparkle_badge' not in seen_keys:
                seen_keys.add('sparkle_badge')
                assets.append(self._asset_spec(
                    key='sparkle_badge', title='Funkel-Badge', asset_type='badge',
                    subject_text='Glanz / Erfolg-Badge', strategy='procedural',
                    priority='low', background_mode='transparent_cutout',
                ))

        # Fallback: wenn keine Subjekte erkannt aber Intent custom_assets fordert
        ic = intent_classification or {}
        if not assets and ic.get('needs_custom_assets'):
            assets.append(self._asset_spec(
                key='hero_mascot', title='Maskottchen', asset_type='mascot',
                subject_text='freundliches Maskottchen', strategy='compiler',
                priority='hero', background_mode='transparent_cutout',
            ))

        # Hartes Cap.
        assets = assets[:max_assets]

        return {
            'asset_pack_name': str(title)[:120],
            'style_family': family,
            'palette': palette,
            'design_tokens': design_tokens,
            'assets': assets,
            'available_procedural': list_generators(),
            'available_aliases': list(GENERATOR_ALIASES.keys()),
        }

    @staticmethod
    def _asset_spec(
        *, key: str, title: str, asset_type: str, subject_text: str,
        strategy: str, priority: str, background_mode: str,
    ) -> dict[str, Any]:
        placement = 'header_left' if priority == 'hero' else 'free'
        mode = AssetPlanner._generation_mode_for(
            strategy=strategy, priority=priority, background_mode=background_mode,
        )
        return {
            'key': key,
            'title': title,
            'asset_type': asset_type,
            'subject_text': subject_text,
            'role': asset_type,
            'priority': priority,
            'background_mode': background_mode,
            'preferred_strategy': strategy,
            'placement_hint': placement,
            'required': priority in ('hero', 'high'),
            'style_notes': '',
            'interaction_notes': '',
            'tags': [asset_type, key.split('_')[0]],
            'generation_mode': mode,
        }

    def _merge_asset_lists(
        self,
        heuristic_assets: list[dict[str, Any]],
        ai_assets: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        max_assets = int(getattr(settings, 'ASSET_MAX_ASSETS_PER_PACK', 8))
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for raw in (ai_assets + heuristic_assets):
            if not isinstance(raw, dict):
                continue
            key = (raw.get('key') or '').strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            strat = str(raw.get('preferred_strategy') or 'svg_free_draw').lower()
            pri = str(raw.get('priority') or 'medium').lower()
            bgm = str(raw.get('background_mode') or 'transparent_cutout').lower()
            gm = raw.get('generation_mode')
            if gm not in ('inline_in_board', 'asset_engine'):
                gm = self._generation_mode_for(strategy=strat, priority=pri, background_mode=bgm)
            else:
                gm = str(gm).lower()
            out.append({
                'key': key,
                'title': str(raw.get('title') or key)[:120],
                'asset_type': str(raw.get('asset_type') or 'other')[:40],
                'subject_text': str(raw.get('subject_text') or raw.get('title') or '')[:200],
                'role': str(raw.get('role') or raw.get('asset_type') or 'other'),
                'priority': pri,
                'background_mode': bgm,
                'preferred_strategy': strat,
                'placement_hint': str(raw.get('placement_hint') or 'free'),
                'required': bool(raw.get('required', False)),
                'style_notes': str(raw.get('style_notes') or ''),
                'interaction_notes': str(raw.get('interaction_notes') or ''),
                'tags': [str(t) for t in (raw.get('tags') or []) if isinstance(t, (str, int))][:8],
                'generation_mode': gm,
            })
            if len(out) >= max_assets:
                break
        return out

    def _build_prompt(
        self,
        payload: dict[str, Any],
        intent: dict[str, Any] | None,
        creative_brief: dict[str, Any] | None,
        style_dna: dict[str, Any] | None,
        heuristic: dict[str, Any],
    ) -> str:
        return (
            'Du bist Art Director für interaktive Unterrichtsmaterialien.\n'
            'Plane ein konsistentes Asset-Pack. Antworte ausschließlich als valides JSON nach Schema.\n'
            f'Lehrerprompt: {payload.get("prompt", "")[:600]}\n'
            f'Fach: {payload.get("subject")} | Klasse: {payload.get("grade")} | Thema: {payload.get("topic")}\n'
            f'Intent: {intent or {}}\n'
            f'Creative Brief: {(creative_brief or {}).get("board_goal", "")[:200]}\n'
            f'Style DNA: {style_dna or {}}\n'
            f'Heuristik-Vorschlag: {heuristic}\n'
            f'Verfügbare Style Families: {[f["id"] for f in asset_style.list_style_families()]}\n'
            f'Verfügbare prozedurale Asset-Keys: {heuristic.get("available_procedural", [])}\n'
            'Regeln:\n'
            '- Plane höchstens 8 Assets.\n'
            '- Hero-Asset maximal 1–2.\n'
            '- Sonne/Wolke/Stern/Pfeil/Badge: ``generation_mode=inline_in_board`` wenn nur einfache Formen; sonst asset_engine.\n'
            '- Mascots/Tiere/svg_free_draw: immer asset_engine.\n'
            '- Wiese/Hintergrund mit background_mode=full_background.\n'
            '- Karten/Grenzen NIE als svg_free_draw — Map-System verwenden.\n'
        )
