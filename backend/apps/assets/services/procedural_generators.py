"""Prozedurale SVG-Generatoren — pure Python, ohne KI-Aufruf.

Jeder Generator gibt ein Dict zurück:

    {"svg": "...", "width": 512, "height": 512, "viewbox": "0 0 512 512"}

und akzeptiert die Parameter ``palette`` (Dict aus ``asset_style.palette_from_dna``),
``design_tokens`` (Dict aus ``asset_style.design_tokens_from_dna``) sowie optionale
generator-spezifische Argumente.

Bewusste Beschränkungen (MVP):
- Keine externen Schriftarten — Texte werden in einfachen ``<text>``-Knoten gesetzt.
- Keine Filter-Effekte (komplizierte ``<filter>``) — Schatten als ``<rect>`` mit Blur via SMIL.
- Konsistente ``viewBox 0 0 512 512`` für alle Standard-Assets.
"""

from __future__ import annotations

import html
import math
from typing import Any, Callable


# Public Signatur eines Generators.
GeneratorFn = Callable[..., dict[str, Any]]


def _palette(palette: dict[str, str] | None) -> dict[str, str]:
    pal = {
        'background': '#F8F4EE',
        'surface': '#FFFFFF',
        'primary': '#3F6FE0',
        'secondary': '#FFB347',
        'accent': '#E04F8F',
        'text': '#1F2A44',
    }
    if isinstance(palette, dict):
        for key in pal:
            value = palette.get(key)
            if isinstance(value, str) and value.strip():
                pal[key] = value.strip()
    return pal


def _tokens(design_tokens: dict[str, Any] | None) -> dict[str, Any]:
    t = {
        'stroke_width': 4,
        'corner_roundness': 18,
        'shadow_style': 'soft_drop',
        'outline_color': '#24324A',
        'line_cap': 'round',
        'sticker_border': True,
    }
    if isinstance(design_tokens, dict):
        t.update({k: v for k, v in design_tokens.items() if v is not None})
    return t


def _wrap(content: str, *, title: str, desc: str = '', width: int = 512, height: int = 512) -> dict[str, Any]:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}">'
        f'<title>{html.escape(title)}</title>'
        f'<desc>{html.escape(desc or title)}</desc>'
        f'{content}'
        f'</svg>'
    )
    return {'svg': svg, 'width': width, 'height': height, 'viewbox': f'0 0 {width} {height}'}


def generate_sun(*, palette: dict[str, str] | None = None, design_tokens: dict[str, Any] | None = None,
                 size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    cx, cy = size / 2, size / 2
    inner_r = size * 0.22
    ray_inner = size * 0.30
    ray_outer = size * 0.43
    rays = ''
    for i in range(12):
        angle = (math.pi * 2 / 12) * i
        x1 = cx + math.cos(angle) * ray_inner
        y1 = cy + math.sin(angle) * ray_inner
        x2 = cx + math.cos(angle) * ray_outer
        y2 = cy + math.sin(angle) * ray_outer
        rays += (
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{pal["secondary"]}" stroke-width="{t["stroke_width"]}" '
            f'stroke-linecap="{t["line_cap"]}" />'
        )
    body = (
        f'<g id="sun">'
        f'{rays}'
        f'<circle cx="{cx}" cy="{cy}" r="{inner_r}" fill="{pal["secondary"]}" />'
        f'<circle cx="{cx - inner_r * 0.35}" cy="{cy - inner_r * 0.18}" r="{inner_r * 0.30}" '
        f'fill="#FFFFFF" opacity="0.45" />'
        f'</g>'
    )
    return _wrap(body, title='Sonne', desc='Stilisierte freundliche Sonne', width=size, height=size)


def generate_cloud(*, palette: dict[str, str] | None = None, design_tokens: dict[str, Any] | None = None,
                   size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="cloud" fill="{pal["surface"]}" stroke="{t["outline_color"]}" '
        f'stroke-width="{t["stroke_width"]}" stroke-linejoin="round">'
        f'<ellipse cx="180" cy="280" rx="110" ry="80" />'
        f'<ellipse cx="280" cy="240" rx="120" ry="100" />'
        f'<ellipse cx="370" cy="280" rx="100" ry="80" />'
        f'<rect x="160" y="290" width="240" height="70" rx="35" />'
        f'</g>'
    )
    return _wrap(body, title='Wolke', desc='Stilisierte Wolke', width=size, height=size)


def generate_star(*, palette: dict[str, str] | None = None, design_tokens: dict[str, Any] | None = None,
                  size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    cx, cy = size / 2, size / 2
    r1, r2 = size * 0.40, size * 0.18
    points = []
    for i in range(10):
        angle = -math.pi / 2 + (math.pi / 5) * i
        r = r1 if i % 2 == 0 else r2
        x = cx + math.cos(angle) * r
        y = cy + math.sin(angle) * r
        points.append(f'{x:.1f},{y:.1f}')
    body = (
        f'<g id="star">'
        f'<polygon points="{" ".join(points)}" fill="{pal["secondary"]}" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" stroke-linejoin="round" />'
        f'</g>'
    )
    return _wrap(body, title='Stern', desc='Stilisierter fünfzackiger Stern', width=size, height=size)


def generate_moon(*, palette: dict[str, str] | None = None, design_tokens: dict[str, Any] | None = None,
                  size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="moon">'
        f'<circle cx="256" cy="256" r="180" fill="{pal["secondary"]}" />'
        f'<circle cx="320" cy="240" r="170" fill="{pal["background"]}" />'
        f'<circle cx="200" cy="220" r="14" fill="{pal["accent"]}" opacity="0.5" />'
        f'<circle cx="170" cy="280" r="10" fill="{pal["accent"]}" opacity="0.4" />'
        f'<circle cx="220" cy="320" r="8" fill="{pal["accent"]}" opacity="0.4" />'
        f'</g>'
    )
    return _wrap(body, title='Mond', desc='Halbmond-Sichel', width=size, height=size)


def generate_arrow(*, palette: dict[str, str] | None = None, design_tokens: dict[str, Any] | None = None,
                   size: int = 512, direction: str = 'right', **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    rotations = {'right': 0, 'down': 90, 'left': 180, 'up': 270}
    rotate = rotations.get(direction, 0)
    body = (
        f'<g id="arrow" transform="rotate({rotate} 256 256)">'
        f'<path d="M64 220 L320 220 L320 150 L460 256 L320 362 L320 292 L64 292 Z" '
        f'fill="{pal["primary"]}" stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" '
        f'stroke-linejoin="round" />'
        f'</g>'
    )
    return _wrap(body, title=f'Pfeil ({direction})', desc='Richtungspfeil', width=size, height=size)


def generate_badge(*, palette: dict[str, str] | None = None, design_tokens: dict[str, Any] | None = None,
                   size: int = 512, label: str = '', **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    text = (label or '').strip()[:8]
    text_node = (
        f'<text x="256" y="276" text-anchor="middle" font-family="system-ui, sans-serif" '
        f'font-size="68" font-weight="700" fill="{pal["text"]}">{html.escape(text)}</text>'
        if text else ''
    )
    body = (
        f'<g id="badge">'
        f'<circle cx="256" cy="256" r="190" fill="{pal["accent"]}" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" />'
        f'<circle cx="256" cy="256" r="160" fill="{pal["surface"]}" opacity="0.95" />'
        f'{text_node}'
        f'</g>'
    )
    return _wrap(body, title='Badge', desc=label or 'Badge / Auszeichnung', width=size, height=size)


def generate_sticker_frame(*, palette: dict[str, str] | None = None, design_tokens: dict[str, Any] | None = None,
                           size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="sticker-frame">'
        f'<rect x="32" y="32" width="448" height="448" rx="48" ry="48" '
        f'fill="{pal["surface"]}" stroke="{pal["primary"]}" stroke-width="{t["stroke_width"] * 2}" />'
        f'<rect x="56" y="56" width="400" height="400" rx="36" ry="36" '
        f'fill="{pal["background"]}" />'
        f'</g>'
    )
    return _wrap(body, title='Sticker-Rahmen', desc='Dicker Sticker-Border', width=size, height=size)


def generate_rounded_card_frame(*, palette: dict[str, str] | None = None,
                                design_tokens: dict[str, Any] | None = None,
                                size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="card-frame">'
        f'<rect x="36" y="44" width="440" height="424" rx="{t["corner_roundness"]}" '
        f'fill="{pal["surface"]}" stroke="{t["outline_color"]}" '
        f'stroke-width="{t["stroke_width"]}" />'
        f'<rect x="36" y="44" width="440" height="60" rx="{t["corner_roundness"]}" '
        f'fill="{pal["primary"]}" />'
        f'</g>'
    )
    return _wrap(body, title='Karten-Rahmen', desc='Karte mit Header-Streifen', width=size, height=size)


def generate_speech_bubble(*, palette: dict[str, str] | None = None,
                           design_tokens: dict[str, Any] | None = None,
                           size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="speech-bubble">'
        f'<path d="M64 96 H448 a32 32 0 0 1 32 32 v200 a32 32 0 0 1 -32 32 H260 L180 432 L200 360 H64 '
        f'a32 32 0 0 1 -32 -32 V128 a32 32 0 0 1 32 -32 Z" '
        f'fill="{pal["surface"]}" stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" '
        f'stroke-linejoin="round" />'
        f'</g>'
    )
    return _wrap(body, title='Sprechblase', desc='Sprechblase-Container', width=size, height=size)


def generate_simple_tree(*, palette: dict[str, str] | None = None,
                         design_tokens: dict[str, Any] | None = None,
                         size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="tree">'
        f'<rect x="232" y="320" width="48" height="120" fill="#8B5A2B" rx="8" />'
        f'<circle cx="256" cy="220" r="120" fill="#5BA572" stroke="{t["outline_color"]}" '
        f'stroke-width="{t["stroke_width"]}" />'
        f'<circle cx="200" cy="170" r="80" fill="#7BBB80" />'
        f'<circle cx="320" cy="180" r="70" fill="#7BBB80" />'
        f'</g>'
    )
    return _wrap(body, title='Baum', desc='Stilisierter Laubbaum', width=size, height=size)


def generate_simple_house(*, palette: dict[str, str] | None = None,
                          design_tokens: dict[str, Any] | None = None,
                          size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="house">'
        f'<polygon points="80,260 256,120 432,260" fill="{pal["accent"]}" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" stroke-linejoin="round" />'
        f'<rect x="120" y="260" width="272" height="180" fill="{pal["secondary"]}" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" />'
        f'<rect x="232" y="320" width="48" height="120" fill="#8B5A2B" />'
        f'<rect x="148" y="296" width="60" height="60" fill="{pal["surface"]}" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"] - 1}" />'
        f'<rect x="304" y="296" width="60" height="60" fill="{pal["surface"]}" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"] - 1}" />'
        f'</g>'
    )
    return _wrap(body, title='Haus', desc='Einfaches Haus mit Tür und Fenstern', width=size, height=size)


def generate_meadow_background(*, palette: dict[str, str] | None = None,
                               design_tokens: dict[str, Any] | None = None,
                               size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    body = (
        f'<g id="meadow">'
        f'<rect x="0" y="0" width="{size}" height="{size}" fill="#BFE6F0" />'
        f'<path d="M0 360 Q128 320 256 360 T512 360 V512 H0 Z" fill="#7BBB80" />'
        f'<path d="M0 410 Q128 380 256 420 T512 410 V512 H0 Z" fill="#5BA572" />'
        f'<circle cx="80" cy="80" r="36" fill="{pal["secondary"]}" />'
        f'<g fill="#FFFFFF" opacity="0.85">'
        f'<ellipse cx="180" cy="120" rx="60" ry="20" />'
        f'<ellipse cx="380" cy="100" rx="50" ry="18" />'
        f'</g>'
        f'</g>'
    )
    return _wrap(body, title='Wiese', desc='Hintergrundbild Wiese mit Himmel', width=size, height=size)


def generate_water_wave(*, palette: dict[str, str] | None = None,
                        design_tokens: dict[str, Any] | None = None,
                        size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    body = (
        f'<g id="water-wave">'
        f'<rect x="0" y="0" width="{size}" height="{size}" fill="#BFE6F0" />'
        f'<path d="M0 240 Q64 200 128 240 T256 240 T384 240 T512 240 V512 H0 Z" fill="#5DA9D6" />'
        f'<path d="M0 300 Q64 270 128 300 T256 300 T384 300 T512 300 V512 H0 Z" fill="#3F8AB8" />'
        f'</g>'
    )
    return _wrap(body, title='Welle', desc='Stilisierter Wasserwellen-Hintergrund', width=size, height=size)


def generate_raindrop(*, palette: dict[str, str] | None = None,
                      design_tokens: dict[str, Any] | None = None,
                      size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="raindrop">'
        f'<path d="M256 80 C 360 220 380 320 256 420 C 132 320 152 220 256 80 Z" '
        f'fill="#5DA9D6" stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" '
        f'stroke-linejoin="round" />'
        f'<ellipse cx="220" cy="240" rx="22" ry="36" fill="#FFFFFF" opacity="0.55" />'
        f'</g>'
    )
    return _wrap(body, title='Regentropfen', desc='Stilisierter Tropfen', width=size, height=size)


def generate_sparkle(*, palette: dict[str, str] | None = None,
                     design_tokens: dict[str, Any] | None = None,
                     size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    body = (
        f'<g id="sparkle" fill="{pal["secondary"]}">'
        f'<path d="M256 96 L286 226 L416 256 L286 286 L256 416 L226 286 L96 256 L226 226 Z" />'
        f'<circle cx="120" cy="120" r="18" />'
        f'<circle cx="400" cy="380" r="14" />'
        f'</g>'
    )
    return _wrap(body, title='Funkeln', desc='Glanz/Sparkle-Akzent', width=size, height=size)


def generate_label_tag(*, palette: dict[str, str] | None = None,
                       design_tokens: dict[str, Any] | None = None,
                       size: int = 512, label: str = '', **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    text = (label or '').strip()[:14]
    text_node = (
        f'<text x="240" y="296" text-anchor="middle" font-family="system-ui, sans-serif" '
        f'font-size="56" font-weight="700" fill="{pal["text"]}">{html.escape(text)}</text>'
        if text else ''
    )
    body = (
        f'<g id="label-tag">'
        f'<path d="M40 200 L100 256 L40 312 H440 a32 32 0 0 0 32 -32 V232 a32 32 0 0 0 -32 -32 Z" '
        f'fill="{pal["primary"]}" stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" '
        f'stroke-linejoin="round" />'
        f'<circle cx="80" cy="256" r="10" fill="{pal["surface"]}" />'
        f'{text_node}'
        f'</g>'
    )
    return _wrap(body, title='Etikett', desc=label or 'Label-Tag', width=size, height=size)


def generate_map_pin(*, palette: dict[str, str] | None = None,
                     design_tokens: dict[str, Any] | None = None,
                     size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="map-pin">'
        f'<path d="M256 80 C 360 80 420 168 420 240 C 420 340 320 420 256 460 C 192 420 92 340 92 240 '
        f'C 92 168 152 80 256 80 Z" '
        f'fill="{pal["accent"]}" stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" />'
        f'<circle cx="256" cy="232" r="56" fill="{pal["surface"]}" />'
        f'</g>'
    )
    return _wrap(body, title='Karten-Pin', desc='Marker für Kartenposition', width=size, height=size)


def generate_check_mark(*, palette: dict[str, str] | None = None,
                        design_tokens: dict[str, Any] | None = None,
                        size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="check-mark">'
        f'<circle cx="256" cy="256" r="190" fill="#5BA572" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" />'
        f'<polyline points="160,260 235,335 365,200" fill="none" '
        f'stroke="{pal["surface"]}" stroke-width="{t["stroke_width"] + 8}" '
        f'stroke-linecap="round" stroke-linejoin="round" />'
        f'</g>'
    )
    return _wrap(body, title='Häkchen', desc='Bestätigung / Erfolg', width=size, height=size)


def generate_warning_badge(*, palette: dict[str, str] | None = None,
                           design_tokens: dict[str, Any] | None = None,
                           size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="warning-badge">'
        f'<polygon points="256,80 460,420 52,420" fill="#F4B042" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" stroke-linejoin="round" />'
        f'<rect x="244" y="180" width="24" height="120" fill="{pal["text"]}" rx="6" />'
        f'<circle cx="256" cy="356" r="16" fill="{pal["text"]}" />'
        f'</g>'
    )
    return _wrap(body, title='Warnung', desc='Achtung-Symbol', width=size, height=size)


def generate_question_bubble(*, palette: dict[str, str] | None = None,
                             design_tokens: dict[str, Any] | None = None,
                             size: int = 512, **_: Any) -> dict[str, Any]:
    pal = _palette(palette)
    t = _tokens(design_tokens)
    body = (
        f'<g id="question-bubble">'
        f'<circle cx="256" cy="256" r="190" fill="{pal["primary"]}" '
        f'stroke="{t["outline_color"]}" stroke-width="{t["stroke_width"]}" />'
        f'<text x="256" y="320" text-anchor="middle" font-family="system-ui, sans-serif" '
        f'font-size="220" font-weight="800" fill="{pal["surface"]}">?</text>'
        f'</g>'
    )
    return _wrap(body, title='Fragezeichen', desc='Hilfe-/Frage-Bubble', width=size, height=size)


GENERATORS: dict[str, GeneratorFn] = {
    'sun': generate_sun,
    'cloud': generate_cloud,
    'star': generate_star,
    'moon': generate_moon,
    'arrow': generate_arrow,
    'badge': generate_badge,
    'sticker_frame': generate_sticker_frame,
    'rounded_card_frame': generate_rounded_card_frame,
    'speech_bubble': generate_speech_bubble,
    'simple_tree': generate_simple_tree,
    'simple_house': generate_simple_house,
    'meadow_background': generate_meadow_background,
    'water_wave': generate_water_wave,
    'raindrop': generate_raindrop,
    'sparkle': generate_sparkle,
    'label_tag': generate_label_tag,
    'map_pin': generate_map_pin,
    'check_mark': generate_check_mark,
    'warning_badge': generate_warning_badge,
    'question_bubble': generate_question_bubble,
}


# Aliasse / Mappings für bekannte semantische Schlüssel.
GENERATOR_ALIASES: dict[str, str] = {
    'sonne': 'sun',
    'wolke': 'cloud',
    'wolken': 'cloud',
    'stern': 'star',
    'mond': 'moon',
    'pfeil': 'arrow',
    'baum': 'simple_tree',
    'haus': 'simple_house',
    'wiese': 'meadow_background',
    'meadow': 'meadow_background',
    'wasser': 'water_wave',
    'regen': 'raindrop',
    'tropfen': 'raindrop',
    'sparkle_glanz': 'sparkle',
    'glanz': 'sparkle',
    'label': 'label_tag',
    'tag': 'label_tag',
    'pin': 'map_pin',
    'haken': 'check_mark',
    'check': 'check_mark',
    'warnung': 'warning_badge',
    'frage': 'question_bubble',
    'fragezeichen': 'question_bubble',
    'sprechblase': 'speech_bubble',
    'card': 'rounded_card_frame',
    'rahmen': 'sticker_frame',
}


def list_generators() -> list[str]:
    return sorted(GENERATORS.keys())


def resolve_generator(name: str | None) -> GeneratorFn | None:
    if not name:
        return None
    key = name.strip().lower()
    if key in GENERATORS:
        return GENERATORS[key]
    alias = GENERATOR_ALIASES.get(key)
    if alias:
        return GENERATORS.get(alias)
    return None


def render(name: str, *, palette: dict[str, str] | None = None,
           design_tokens: dict[str, Any] | None = None,
           **kwargs: Any) -> dict[str, Any] | None:
    """Bequemer Aufruf-Wrapper. Liefert ``None``, wenn ``name`` unbekannt ist."""

    fn = resolve_generator(name)
    if not fn:
        return None
    return fn(palette=palette, design_tokens=design_tokens, **kwargs)
