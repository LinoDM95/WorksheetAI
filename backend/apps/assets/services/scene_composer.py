"""Scene Composer.

Wandelt einen ``AssetPack`` in das vom Code-Prompt benötigte
``asset_pack_summary``-Dict um. Zentrale Aufgabe: Hybrid-Auslieferung
entscheiden — kleine SVGs (≤ ``ASSET_INLINE_MAX_BYTES``) inline an die KI
übergeben, größere als URL referenzieren (``/board-generated-assets/<id>.svg``).
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from django.conf import settings


if TYPE_CHECKING:  # vermeidet zirkuläre Import-Probleme im Test-Setup
    from apps.assets.models import AssetPack, GeneratedAsset


def _decide_delivery(asset: 'GeneratedAsset', inline_max_bytes: int) -> str:
    body = asset.normalized_svg or asset.svg or ''
    bg = (asset.background_mode or '').lower()
    if not body:
        return 'url'
    if bg in ('full_background', 'framed_scene'):
        return 'url'
    return 'inline' if len(body) <= inline_max_bytes else 'url'


def _asset_summary_entry(asset: 'GeneratedAsset', delivery: str) -> dict[str, Any]:
    body = asset.normalized_svg or asset.svg or ''
    entry: dict[str, Any] = {
        'id': str(asset.id),
        'key': asset.key,
        'title': asset.title,
        'role': asset.asset_type,
        'priority': asset.priority,
        'background_mode': asset.background_mode,
        'strategy': asset.strategy,
        'width': asset.width,
        'height': asset.height,
        'viewbox': asset.viewbox,
        'size_hint': len(body),
        'delivery': delivery,
        'tags': asset.tags or [],
    }
    if delivery == 'inline':
        entry['inline_svg'] = body
    else:
        entry['url'] = f'/board-generated-assets/{asset.id}.svg'
    return entry


def _style_rules(pack: 'AssetPack') -> dict[str, Any]:
    return {
        'style_family': pack.style_family or '',
        'palette': pack.palette or {},
        'design_tokens': pack.design_tokens or {},
    }


def _usage_rules(pack: 'AssetPack') -> list[str]:
    return [
        'Nutze ausschließlich die hier gelisteten Assets — generiere keine neuen Figuren in HTML/CSS/JS.',
        'Inline-SVGs direkt einfügen (kein script innerhalb), URL-Assets via <img src="..."/> einbinden.',
        'Hero-Asset prominent in den Header-Bereich. Sticker/Badges nicht über interaktive Buttons legen.',
        'Hintergrund-Assets mit background_mode=full_background absolut positionieren (z-index < 0).',
        f'Style Family: {pack.style_family or "soft_cartoon"}.',
        'Halte Stroke-Width und Outline-Color konsistent mit den Design Tokens.',
    ]


def compose(pack: 'AssetPack') -> dict[str, Any]:
    """Erzeugt das ``asset_pack_summary`` für den Code-Prompt."""

    inline_max = int(getattr(settings, 'ASSET_INLINE_MAX_BYTES', 8000))
    assets_qs = pack.assets.filter().order_by('priority', 'key') if pack else []
    assets_list = list(assets_qs)

    entries: list[dict[str, Any]] = []
    inline_count = 0
    url_count = 0
    for asset in assets_list:
        delivery = _decide_delivery(asset, inline_max)
        entries.append(_asset_summary_entry(asset, delivery))
        if delivery == 'inline':
            inline_count += 1
        else:
            url_count += 1

    return {
        'pack_id': str(pack.id),
        'pack_name': pack.name,
        'pack_status': pack.status,
        'pack_quality_score': pack.quality_score,
        'style_rules': _style_rules(pack),
        'usage_rules': _usage_rules(pack),
        'assets': entries,
        'totals': {
            'count': len(entries),
            'inline_count': inline_count,
            'url_count': url_count,
            'inline_max_bytes': inline_max,
        },
        'consistency': pack.consistency_report or {},
        'warnings': pack.warnings or [],
    }


def brief_entries_from_specs(inline_specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    brief: list[dict[str, Any]] = []
    for raw in inline_specs:
        if not isinstance(raw, dict):
            continue
        key = (raw.get('key') or '').strip().lower()
        if not key:
            continue
        brief.append({
            'key': key,
            'title': str(raw.get('title') or key)[:120],
            'asset_type': str(raw.get('asset_type') or 'decoration'),
            'subject_text': str(raw.get('subject_text') or '')[:200],
            'placement_hint': str(raw.get('placement_hint') or 'free'),
            'priority': str(raw.get('priority') or 'medium').lower(),
            'generation_mode': 'inline_in_board',
        })
    return brief


def _usage_rules_inline_mixed(plan_name: str) -> list[str]:
    return [
        'Für jeden Eintrag unter „inline_asset_brief“: **selbst** ein minimales Inline-SVG im HTML zeichnen '
        '(ein <svg>-Root, sinnvolle viewBox 0..512, **kein** <script>).',
        'Keine Doppelarbeit: diese Keys haben **kein** vorgefertigtes Pack-SVG — keine erfundenen URLs dafür.',
        'Alle anderen Keys weiterhin nur über die Pack-Liste (inline_svg/url) verwenden.',
        f'Namenskontext: {plan_name}',
    ]


def merge_inline_into_summary(summary: dict[str, Any], inline_specs: list[dict[str, Any]]) -> dict[str, Any]:
    if not inline_specs:
        return summary
    brief = brief_entries_from_specs(inline_specs)
    merged = dict(summary)
    existing = list(merged.get('inline_asset_brief') or [])
    merged['inline_asset_brief'] = existing + brief
    merged['usage_rules'] = list(_usage_rules_inline_mixed(str(summary.get('pack_name') or ''))) + list(merged.get('usage_rules') or [])
    return merged


def summary_plan_inline_only(plan: dict[str, Any], inline_specs: list[dict[str, Any]]) -> dict[str, Any]:
    name = str(plan.get('asset_pack_name') or 'Assets')
    style = {
        'style_family': str(plan.get('style_family') or 'soft_cartoon'),
        'palette': plan.get('palette') or {},
        'design_tokens': plan.get('design_tokens') or {},
    }
    brief = brief_entries_from_specs(inline_specs)
    return {
        'pack_id': '',
        'pack_name': name,
        'pack_status': 'inline_only',
        'pack_quality_score': None,
        'style_rules': style,
        'usage_rules': list(_usage_rules_inline_mixed(name)) + ['Nur „inline_asset_brief“ nutzen — keine Pack-Asset-URLs.'],
        'assets': [],
        'inline_asset_brief': brief,
        'totals': {
            'count': 0,
            'inline_count': 0,
            'url_count': 0,
            'inline_brief_count': len(brief),
        },
        'consistency': {},
        'warnings': [],
    }
