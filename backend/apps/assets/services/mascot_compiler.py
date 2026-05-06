"""Mascot / Character-Kit-Compiler.

Erzeugt deterministisch SVG-Mascots aus einem Shape-Kit:
- Kopfform (rund, eckig, eiförmig je species)
- Augen (groß, freundlich, sparkle)
- Mund/Nase
- Body, Arme, Beine
- Optional Accessoires (Buch, Sparkle, Sticker-Border)

Unterstützt MVP: ``bear``, ``rabbit``, ``monster``, ``generic``.

Bewusst ohne komplexe Pfade — wenige starke Formen, freundliche Proportionen,
konsistenter Outline-Stil.
"""

from __future__ import annotations

import html
from typing import Any


SUPPORTED_SPECIES = ('bear', 'rabbit', 'monster', 'generic')
SUPPORTED_POSES = ('standing', 'wave', 'pointing', 'holding_book', 'jumping')
SUPPORTED_EXPRESSIONS = ('happy', 'curious', 'thinking', 'excited')


def _palette_defaults(species: str) -> dict[str, str]:
    return {
        'bear': {'fur': '#A57A56', 'fur_dark': '#7E5A3E', 'belly': '#E9D2B5'},
        'rabbit': {'fur': '#F0E6E0', 'fur_dark': '#C9BAB0', 'belly': '#FFFFFF'},
        'monster': {'fur': '#74C0A2', 'fur_dark': '#4F9B7E', 'belly': '#C9F0E1'},
        'generic': {'fur': '#FFB347', 'fur_dark': '#E08A1F', 'belly': '#FFE2B0'},
    }.get(species, {'fur': '#FFB347', 'fur_dark': '#E08A1F', 'belly': '#FFE2B0'})


def _wrap(content: str, *, title: str, desc: str, width: int = 512, height: int = 512) -> dict[str, Any]:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<title>{html.escape(title)}</title>'
        f'<desc>{html.escape(desc)}</desc>'
        f'{content}'
        f'</svg>'
    )
    return {'svg': svg, 'width': width, 'height': height, 'viewbox': f'0 0 {width} {height}'}


def _eyes(expression: str, *, cx_left: float, cx_right: float, cy: float, scale: float = 1.0,
          outline: str = '#1F2A44') -> str:
    """Augen + Highlights je Expression. ``scale`` in [0.6 .. 1.4]."""
    r = 30 * scale
    pupil_r = 12 * scale
    sparkle_r = 6 * scale
    if expression == 'thinking':
        # halbgeschlossen
        return (
            f'<g class="eyes">'
            f'<ellipse cx="{cx_left}" cy="{cy}" rx="{r}" ry="{r * 0.5}" fill="white" stroke="{outline}" stroke-width="3" />'
            f'<ellipse cx="{cx_right}" cy="{cy}" rx="{r}" ry="{r * 0.5}" fill="white" stroke="{outline}" stroke-width="3" />'
            f'<circle cx="{cx_left}" cy="{cy}" r="{pupil_r}" fill="{outline}" />'
            f'<circle cx="{cx_right}" cy="{cy}" r="{pupil_r}" fill="{outline}" />'
            f'</g>'
        )
    if expression == 'excited':
        return (
            f'<g class="eyes">'
            f'<circle cx="{cx_left}" cy="{cy}" r="{r * 1.1}" fill="white" stroke="{outline}" stroke-width="3" />'
            f'<circle cx="{cx_right}" cy="{cy}" r="{r * 1.1}" fill="white" stroke="{outline}" stroke-width="3" />'
            f'<circle cx="{cx_left}" cy="{cy}" r="{pupil_r * 1.3}" fill="{outline}" />'
            f'<circle cx="{cx_right}" cy="{cy}" r="{pupil_r * 1.3}" fill="{outline}" />'
            f'<circle cx="{cx_left - sparkle_r}" cy="{cy - sparkle_r}" r="{sparkle_r}" fill="white" />'
            f'<circle cx="{cx_right - sparkle_r}" cy="{cy - sparkle_r}" r="{sparkle_r}" fill="white" />'
            f'</g>'
        )
    if expression == 'curious':
        return (
            f'<g class="eyes">'
            f'<circle cx="{cx_left}" cy="{cy}" r="{r}" fill="white" stroke="{outline}" stroke-width="3" />'
            f'<circle cx="{cx_right}" cy="{cy + 4}" r="{r * 0.85}" fill="white" stroke="{outline}" stroke-width="3" />'
            f'<circle cx="{cx_left + 4}" cy="{cy}" r="{pupil_r}" fill="{outline}" />'
            f'<circle cx="{cx_right - 4}" cy="{cy + 4}" r="{pupil_r * 0.9}" fill="{outline}" />'
            f'<circle cx="{cx_left}" cy="{cy - sparkle_r}" r="{sparkle_r}" fill="white" />'
            f'</g>'
        )
    # happy (default)
    return (
        f'<g class="eyes">'
        f'<circle cx="{cx_left}" cy="{cy}" r="{r}" fill="white" stroke="{outline}" stroke-width="3" />'
        f'<circle cx="{cx_right}" cy="{cy}" r="{r}" fill="white" stroke="{outline}" stroke-width="3" />'
        f'<circle cx="{cx_left + 2}" cy="{cy + 4}" r="{pupil_r}" fill="{outline}" />'
        f'<circle cx="{cx_right + 2}" cy="{cy + 4}" r="{pupil_r}" fill="{outline}" />'
        f'<circle cx="{cx_left - sparkle_r * 0.5}" cy="{cy - sparkle_r * 0.5}" r="{sparkle_r}" fill="white" />'
        f'<circle cx="{cx_right - sparkle_r * 0.5}" cy="{cy - sparkle_r * 0.5}" r="{sparkle_r}" fill="white" />'
        f'</g>'
    )


def _mouth(expression: str, *, cx: float, cy: float, outline: str = '#1F2A44') -> str:
    if expression == 'thinking':
        return f'<line x1="{cx - 24}" y1="{cy}" x2="{cx + 24}" y2="{cy}" stroke="{outline}" stroke-width="6" stroke-linecap="round" />'
    if expression == 'excited':
        return (
            f'<path d="M{cx - 32} {cy - 8} Q{cx} {cy + 36} {cx + 32} {cy - 8} Z" fill="{outline}" />'
            f'<path d="M{cx - 28} {cy - 4} Q{cx} {cy + 28} {cx + 28} {cy - 4}" fill="#E04F8F" />'
        )
    if expression == 'curious':
        return f'<circle cx="{cx}" cy="{cy + 4}" r="10" fill="{outline}" />'
    return f'<path d="M{cx - 30} {cy} Q{cx} {cy + 28} {cx + 30} {cy}" stroke="{outline}" stroke-width="6" fill="none" stroke-linecap="round" />'


def _accessory(name: str, palette: dict[str, str]) -> str:
    if name == 'book':
        return (
            f'<g class="accessory book">'
            f'<rect x="180" y="380" width="152" height="80" rx="8" fill="{palette["secondary"]}" stroke="#1F2A44" stroke-width="3" />'
            f'<line x1="256" y1="380" x2="256" y2="460" stroke="#1F2A44" stroke-width="3" />'
            f'</g>'
        )
    if name == 'pencil':
        return (
            f'<g class="accessory pencil">'
            f'<rect x="360" y="220" width="20" height="120" fill="{palette["secondary"]}" stroke="#1F2A44" stroke-width="3" transform="rotate(-30 370 280)" />'
            f'<polygon points="356,212 384,212 370,194" fill="#1F2A44" transform="rotate(-30 370 280)" />'
            f'</g>'
        )
    if name == 'backpack':
        return (
            f'<g class="accessory backpack">'
            f'<rect x="92" y="280" width="80" height="120" rx="14" fill="{palette["primary"]}" stroke="#1F2A44" stroke-width="3" />'
            f'<rect x="100" y="320" width="64" height="32" fill="{palette["surface"]}" />'
            f'</g>'
        )
    return ''


def _ears(species: str, palette: dict[str, str], outline: str) -> str:
    if species == 'bear':
        return (
            f'<g class="ears">'
            f'<circle cx="156" cy="120" r="40" fill="{palette["fur_dark"]}" stroke="{outline}" stroke-width="4" />'
            f'<circle cx="356" cy="120" r="40" fill="{palette["fur_dark"]}" stroke="{outline}" stroke-width="4" />'
            f'<circle cx="156" cy="124" r="22" fill="{palette["belly"]}" />'
            f'<circle cx="356" cy="124" r="22" fill="{palette["belly"]}" />'
            f'</g>'
        )
    if species == 'rabbit':
        return (
            f'<g class="ears">'
            f'<ellipse cx="190" cy="80" rx="22" ry="60" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'<ellipse cx="322" cy="80" rx="22" ry="60" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'<ellipse cx="190" cy="80" rx="10" ry="40" fill="#FFD3DA" />'
            f'<ellipse cx="322" cy="80" rx="10" ry="40" fill="#FFD3DA" />'
            f'</g>'
        )
    if species == 'monster':
        return (
            f'<g class="ears horns">'
            f'<polygon points="156,90 184,170 130,150" fill="{palette["fur_dark"]}" stroke="{outline}" stroke-width="4" />'
            f'<polygon points="356,90 328,170 382,150" fill="{palette["fur_dark"]}" stroke="{outline}" stroke-width="4" />'
            f'</g>'
        )
    return ''


def _arms(pose: str, palette: dict[str, str], outline: str) -> str:
    if pose == 'wave':
        return (
            f'<g class="arms">'
            f'<path d="M120 280 Q90 230 110 180" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'<circle cx="108" cy="172" r="22" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'<path d="M392 280 Q422 320 432 360" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'<circle cx="434" cy="364" r="20" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'</g>'
        )
    if pose == 'pointing':
        return (
            f'<g class="arms">'
            f'<path d="M392 280 Q440 280 470 240" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'<circle cx="476" cy="232" r="20" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'<path d="M120 280 Q90 320 100 360" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'<circle cx="100" cy="364" r="20" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'</g>'
        )
    if pose == 'holding_book':
        return (
            f'<g class="arms">'
            f'<path d="M132 320 Q160 360 200 380" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'<path d="M380 320 Q352 360 312 380" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'</g>'
        )
    if pose == 'jumping':
        return (
            f'<g class="arms">'
            f'<path d="M120 240 Q70 180 100 130" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'<circle cx="92" cy="120" r="22" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'<path d="M392 240 Q442 180 412 130" stroke="{palette["fur"]}" stroke-width="32" '
            f'fill="none" stroke-linecap="round" />'
            f'<circle cx="420" cy="120" r="22" fill="{palette["fur"]}" stroke="{outline}" stroke-width="4" />'
            f'</g>'
        )
    # standing
    return (
        f'<g class="arms">'
        f'<path d="M132 280 Q108 340 132 400" stroke="{palette["fur"]}" stroke-width="32" '
        f'fill="none" stroke-linecap="round" />'
        f'<path d="M380 280 Q404 340 380 400" stroke="{palette["fur"]}" stroke-width="32" '
        f'fill="none" stroke-linecap="round" />'
        f'</g>'
    )


def compile_mascot(spec: dict[str, Any]) -> dict[str, Any]:
    """Generiert ein Mascot-SVG aus einer ``MascotSpec``.

    Bei unbekannten Werten fällt der Compiler auf ``generic`` / ``standing`` /
    ``happy`` zurück, statt einen Fehler zu werfen.
    """

    species = (spec.get('species') or 'generic').strip().lower()
    if species not in SUPPORTED_SPECIES:
        species = 'generic'
    pose = (spec.get('pose') or 'standing').strip().lower()
    if pose not in SUPPORTED_POSES:
        pose = 'standing'
    expression = (spec.get('expression') or 'happy').strip().lower()
    if expression not in SUPPORTED_EXPRESSIONS:
        expression = 'happy'

    accessories = spec.get('accessories') or []
    if not isinstance(accessories, list):
        accessories = []

    palette_in = spec.get('palette') or {}
    if not isinstance(palette_in, dict):
        palette_in = {}
    species_pal = _palette_defaults(species)
    palette = {
        'fur': palette_in.get('fur') or palette_in.get('primary') or species_pal['fur'],
        'fur_dark': palette_in.get('fur_dark') or palette_in.get('secondary') or species_pal['fur_dark'],
        'belly': palette_in.get('belly') or palette_in.get('surface') or species_pal['belly'],
        'primary': palette_in.get('primary') or '#3F6FE0',
        'secondary': palette_in.get('secondary') or '#FFB347',
        'surface': palette_in.get('surface') or '#FFFFFF',
    }

    tokens = spec.get('design_tokens') or {}
    outline = (tokens.get('outline_color') or '#1F2A44').strip()
    stroke_w = int(tokens.get('stroke_width') or 4)
    sticker_border = bool(tokens.get('sticker_border'))

    # Y-Versatz für jumping-Pose.
    body_translate = -36 if pose == 'jumping' else 0
    head_cx = 256
    head_cy = 230 + body_translate
    head_r = 130
    body_cx = 256
    body_cy = 380 + body_translate

    head = (
        f'<circle cx="{head_cx}" cy="{head_cy}" r="{head_r}" fill="{palette["fur"]}" '
        f'stroke="{outline}" stroke-width="{stroke_w}" />'
    )
    if species == 'monster':
        head = (
            f'<rect x="{head_cx - head_r}" y="{head_cy - head_r}" width="{head_r * 2}" height="{head_r * 2}" '
            f'rx="60" fill="{palette["fur"]}" stroke="{outline}" stroke-width="{stroke_w}" />'
        )
    elif species == 'rabbit':
        head = (
            f'<ellipse cx="{head_cx}" cy="{head_cy}" rx="{head_r}" ry="{head_r * 1.05}" fill="{palette["fur"]}" '
            f'stroke="{outline}" stroke-width="{stroke_w}" />'
        )

    snout = (
        f'<ellipse cx="{head_cx}" cy="{head_cy + 20}" rx="46" ry="32" fill="{palette["belly"]}" />'
    )
    nose = (
        f'<ellipse cx="{head_cx}" cy="{head_cy + 8}" rx="14" ry="10" fill="{outline}" />'
    )

    eyes = _eyes(expression, cx_left=head_cx - 50, cx_right=head_cx + 50, cy=head_cy - 20, outline=outline)
    mouth = _mouth(expression, cx=head_cx, cy=head_cy + 50, outline=outline)
    ears = _ears(species, palette, outline)

    body = (
        f'<g class="body">'
        f'<ellipse cx="{body_cx}" cy="{body_cy}" rx="120" ry="100" fill="{palette["fur"]}" '
        f'stroke="{outline}" stroke-width="{stroke_w}" />'
        f'<ellipse cx="{body_cx}" cy="{body_cy + 6}" rx="80" ry="70" fill="{palette["belly"]}" />'
        f'</g>'
    )

    legs = (
        f'<g class="legs">'
        f'<ellipse cx="{body_cx - 50}" cy="{body_cy + 110}" rx="36" ry="28" fill="{palette["fur"]}" '
        f'stroke="{outline}" stroke-width="{stroke_w}" />'
        f'<ellipse cx="{body_cx + 50}" cy="{body_cy + 110}" rx="36" ry="28" fill="{palette["fur"]}" '
        f'stroke="{outline}" stroke-width="{stroke_w}" />'
        f'</g>'
    )

    accessories_svg = ''.join(_accessory(a, palette) for a in accessories if isinstance(a, str))

    sticker = ''
    if sticker_border:
        sticker = (
            f'<rect x="20" y="20" width="472" height="472" rx="48" fill="none" '
            f'stroke="{palette["surface"]}" stroke-width="14" />'
        )

    arms = _arms(pose, palette, outline)

    body_group = (
        f'<g class="mascot" transform="translate(0,{body_translate})">'
        f'{ears}{head}{snout}{nose}{eyes}{mouth}'
        f'{body}{legs}{arms}'
        f'{accessories_svg}'
        f'</g>'
    )

    title = f'{species.title()} Mascot'
    desc = f'{species.title()} mascot in pose {pose}, expression {expression}'
    return _wrap(sticker + body_group, title=title, desc=desc)


def supported_species() -> list[str]:
    return list(SUPPORTED_SPECIES)


def supported_poses() -> list[str]:
    return list(SUPPORTED_POSES)


def supported_expressions() -> list[str]:
    return list(SUPPORTED_EXPRESSIONS)
