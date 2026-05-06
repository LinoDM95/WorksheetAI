"""AssetPack-Consistency-Check.

Prüft, ob Assets eines Packs visuell konsistent sind:
- Palette-Schnittmenge (Wie viele Farben werden geteilt? Gibt es Ausreißer?)
- Stroke-Width-Streuung (alle ähnlich? oder zu unterschiedlich?)
- Detail-Level-Streuung (Pfadanzahl-Verteilung)
- Style-Family-Tag (alle Assets gleich?)

Liefert Score 0–100 + Suggestions (welche Repair-Modi pro Asset?).
"""

from __future__ import annotations

import re
from statistics import mean, pstdev
from typing import Any


_HEX_COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b')
_PATH_RE = re.compile(r'<\s*path\b', re.IGNORECASE)
_STROKE_WIDTH_RE = re.compile(r'stroke-width\s*=\s*["\']?(\d+(?:\.\d+)?)', re.IGNORECASE)


def _extract_colors(svg: str) -> list[str]:
    return [m.group(0).lower() for m in _HEX_COLOR_RE.finditer(svg or '')]


def _path_count(svg: str) -> int:
    return len(_PATH_RE.findall(svg or ''))


def _avg_stroke(svg: str) -> float | None:
    widths = [float(m.group(1)) for m in _STROKE_WIDTH_RE.finditer(svg or '')]
    if not widths:
        return None
    return mean(widths)


def evaluate_pack(assets: list[dict[str, Any]]) -> dict[str, Any]:
    """Liefert Konsistenz-Score + Befunde + Repair-Vorschläge.

    Erwartet ein Asset-Dict mit mindestens ``svg`` und optional
    ``style_family``, ``key``.
    """

    if not assets:
        return {
            'score': 0.0,
            'palette_consistency': 0.0,
            'stroke_consistency': 0.0,
            'detail_consistency': 0.0,
            'style_family_consistency': 1.0,
            'shared_palette': [],
            'outlier_assets': [],
            'suggestions': [],
        }

    palettes: list[list[str]] = [_extract_colors(a.get('svg') or '') for a in assets]
    counts = [_path_count(a.get('svg') or '') for a in assets]
    strokes = [_avg_stroke(a.get('svg') or '') for a in assets]
    families = [(a.get('style_family') or '').strip().lower() for a in assets]

    palette_score, shared = _palette_score(palettes)
    stroke_score = _stroke_score(strokes)
    detail_score = _detail_score(counts)
    family_score = _family_score(families)

    # gewichtete Summe
    score = (
        palette_score * 0.40
        + stroke_score * 0.20
        + detail_score * 0.15
        + family_score * 0.25
    )
    score = round(score * 100, 1)

    suggestions: list[dict[str, Any]] = []
    outliers: list[str] = []

    # Pro-Asset Heuristik: starke Abweichung → Vorschlag
    if palettes:
        all_colors_flat = [c for sub in palettes for c in sub]
        share_threshold = 0.4
        for asset, colors in zip(assets, palettes):
            if not colors:
                continue
            shared_with_pack = len(set(colors) & set(all_colors_flat)) / max(1, len(set(colors)))
            if shared_with_pack < share_threshold:
                outliers.append(asset.get('key') or '')
                suggestions.append({
                    'asset_key': asset.get('key'),
                    'mode': 'improve_color_harmony',
                    'reason': 'Asset teilt zu wenige Farben mit dem Pack.',
                })

    if strokes and len([s for s in strokes if s is not None]) > 1:
        valid = [s for s in strokes if s is not None]
        spread = pstdev(valid) if len(valid) > 1 else 0
        if spread > 2.0:
            for asset, sw in zip(assets, strokes):
                if sw is None:
                    continue
                if abs(sw - mean(valid)) > 2.5:
                    suggestions.append({
                        'asset_key': asset.get('key'),
                        'mode': 'improve_style_fit',
                        'reason': f'Stroke-Width {sw:.1f} weicht stark vom Pack-Mittel {mean(valid):.1f} ab.',
                    })

    if len(set([f for f in families if f])) > 1:
        suggestions.append({
            'asset_key': '*',
            'mode': 'improve_style_fit',
            'reason': 'Mehrere Style Families im selben Pack.',
        })

    return {
        'score': score,
        'palette_consistency': round(palette_score, 3),
        'stroke_consistency': round(stroke_score, 3),
        'detail_consistency': round(detail_score, 3),
        'style_family_consistency': round(family_score, 3),
        'shared_palette': shared,
        'outlier_assets': sorted(set(o for o in outliers if o)),
        'suggestions': suggestions,
    }


def _palette_score(palettes: list[list[str]]) -> tuple[float, list[str]]:
    if not palettes:
        return 1.0, []
    all_colors = set()
    for sub in palettes:
        all_colors.update(sub)
    if not all_colors:
        return 1.0, []
    intersection_count: list[int] = []
    for sub in palettes:
        if not sub:
            intersection_count.append(0)
            continue
        intersection_count.append(len(set(sub) & all_colors))
    if not intersection_count:
        return 0.0, []
    avg_intersect = mean(intersection_count)
    span = max(1, len(all_colors))
    score = min(1.0, avg_intersect / max(2, span * 0.6))
    shared = sorted(c for c in all_colors if all(c in (sub or []) for sub in palettes))
    return score, shared[:8]


def _stroke_score(strokes: list[float | None]) -> float:
    valid = [s for s in strokes if s is not None]
    if len(valid) < 2:
        return 1.0
    spread = pstdev(valid)
    if spread <= 0.5:
        return 1.0
    if spread >= 4.0:
        return 0.4
    return max(0.4, min(1.0, 1.0 - (spread - 0.5) / 4.0))


def _detail_score(counts: list[int]) -> float:
    if not counts:
        return 1.0
    if len(counts) < 2:
        return 1.0
    spread = pstdev(counts)
    if spread <= 8:
        return 1.0
    if spread >= 80:
        return 0.4
    return max(0.4, min(1.0, 1.0 - (spread - 8) / 80))


def _family_score(families: list[str]) -> float:
    valid = [f for f in families if f]
    if not valid:
        return 1.0
    return 1.0 if len(set(valid)) == 1 else 0.5
