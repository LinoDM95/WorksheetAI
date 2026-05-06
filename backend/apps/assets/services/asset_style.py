"""Style Families und Design Tokens der Asset-Engine.

Eine Style Family bündelt visuelle Regeln (Form, Kontur, Schatten, Farbpalette,
Detail-Level), die für ein konsistentes Asset-Pack gelten. Aus der Style DNA des
Boards leitet ``style_family_from_dna`` automatisch die passende Familie ab.
"""

from __future__ import annotations

from typing import Any


STYLE_FAMILIES: dict[str, dict[str, Any]] = {
    'cute_round_mascot': {
        'id': 'cute_round_mascot',
        'description': 'Runde freundliche Mascots/Tiere/Monster für Grundschule.',
        'best_for': ['mascot', 'character', 'animal', 'sticker'],
        'avoid_for': ['historical_atlas', 'diagram_symbol'],
        'shape_language': ['round_corners', 'soft_curves', 'large_eyes'],
        'palette_rules': {'max_colors': 5, 'saturation': 'soft_high', 'mood': 'friendly'},
        'stroke_rules': {'width': 4, 'cap': 'round', 'color_mode': 'dark_outline'},
        'shadow_rules': {'style': 'soft_drop', 'opacity': 0.18},
        'detail_level': 'low',
        'allowed_asset_types': ['mascot', 'character', 'animal', 'sticker', 'badge'],
        'negative_rules': ['no_realistic_textures', 'no_dark_palette', 'no_thin_lines'],
    },
    'soft_cartoon': {
        'id': 'soft_cartoon',
        'description': 'Universelle Cartoon-Illustrationen mit warmen Farben.',
        'best_for': ['scene_object', 'icon', 'mascot', 'sticker'],
        'avoid_for': ['historical_atlas'],
        'shape_language': ['rounded_rect', 'soft_curves'],
        'palette_rules': {'max_colors': 6, 'saturation': 'medium', 'mood': 'warm'},
        'stroke_rules': {'width': 3, 'cap': 'round'},
        'shadow_rules': {'style': 'soft_drop', 'opacity': 0.15},
        'detail_level': 'medium',
        'allowed_asset_types': ['mascot', 'scene_object', 'icon', 'sticker', 'badge', 'character'],
        'negative_rules': ['no_clipart', 'no_neon'],
    },
    'storybook_flat': {
        'id': 'storybook_flat',
        'description': 'Erzählerisch, warm, schöne Flächen — ideal Deutsch/Sachunterricht.',
        'best_for': ['scene_object', 'background_layer', 'character'],
        'avoid_for': ['diagram_symbol'],
        'shape_language': ['flat_shapes', 'organic_curves', 'painterly_edges'],
        'palette_rules': {'max_colors': 6, 'saturation': 'soft_high', 'mood': 'storybook'},
        'stroke_rules': {'width': 0, 'cap': 'round'},
        'shadow_rules': {'style': 'soft_drop', 'opacity': 0.12},
        'detail_level': 'medium',
        'allowed_asset_types': ['scene_object', 'background_layer', 'character', 'mascot', 'frame'],
        'negative_rules': ['no_outline_clip_art', 'no_synthetic_shadow'],
    },
    'clean_flat': {
        'id': 'clean_flat',
        'description': 'Professionelle Infografik / Icons für Sekundarstufe.',
        'best_for': ['icon', 'diagram_symbol', 'badge'],
        'avoid_for': ['mascot', 'character'],
        'shape_language': ['geometric', 'flat'],
        'palette_rules': {'max_colors': 4, 'saturation': 'medium_low', 'mood': 'neutral'},
        'stroke_rules': {'width': 2, 'cap': 'round'},
        'shadow_rules': {'style': 'none', 'opacity': 0.0},
        'detail_level': 'low',
        'allowed_asset_types': ['icon', 'diagram_symbol', 'badge', 'arrow', 'frame', 'pattern'],
        'negative_rules': ['no_kindergarten_styling'],
    },
    'rough_handdrawn': {
        'id': 'rough_handdrawn',
        'description': 'Skizzenhaft, Tafel-Look — gut für Erklärdiagramme.',
        'best_for': ['diagram_symbol', 'icon', 'arrow', 'badge'],
        'avoid_for': ['mascot'],
        'shape_language': ['hand_drawn', 'wobbly_lines'],
        'palette_rules': {'max_colors': 3, 'saturation': 'low', 'mood': 'chalkboard'},
        'stroke_rules': {'width': 3, 'cap': 'round', 'color_mode': 'dark_outline'},
        'shadow_rules': {'style': 'none', 'opacity': 0.0},
        'detail_level': 'low',
        'allowed_asset_types': ['diagram_symbol', 'icon', 'arrow', 'badge', 'frame'],
        'negative_rules': ['no_glossy', 'no_gradient'],
    },
    'classroom_icon': {
        'id': 'classroom_icon',
        'description': 'Einfache klare Unterrichtsicons für UI-Akzente.',
        'best_for': ['icon', 'badge', 'marker'],
        'avoid_for': ['background_layer'],
        'shape_language': ['flat_geometric'],
        'palette_rules': {'max_colors': 3, 'saturation': 'medium', 'mood': 'practical'},
        'stroke_rules': {'width': 3, 'cap': 'round', 'color_mode': 'dark_outline'},
        'shadow_rules': {'style': 'none', 'opacity': 0.0},
        'detail_level': 'low',
        'allowed_asset_types': ['icon', 'badge', 'marker', 'arrow', 'pattern'],
        'negative_rules': ['no_decorative_elements'],
    },
    'science_lab_cartoon': {
        'id': 'science_lab_cartoon',
        'description': 'Labore, Reagenzgläser, Mikroskope — klar, neugierig.',
        'best_for': ['scene_object', 'icon', 'diagram_symbol'],
        'avoid_for': ['historical_atlas'],
        'shape_language': ['rounded_geometric', 'curved'],
        'palette_rules': {'max_colors': 5, 'saturation': 'medium', 'mood': 'curious'},
        'stroke_rules': {'width': 3, 'cap': 'round'},
        'shadow_rules': {'style': 'soft_drop', 'opacity': 0.15},
        'detail_level': 'medium',
        'allowed_asset_types': ['scene_object', 'icon', 'diagram_symbol', 'badge', 'pattern'],
        'negative_rules': ['no_kindergarten_round'],
    },
    'historical_atlas': {
        'id': 'historical_atlas',
        'description': 'Karten, Marker, Legenden, alte Dokumentoptik.',
        'best_for': ['marker', 'frame', 'pattern', 'badge'],
        'avoid_for': ['mascot', 'character'],
        'shape_language': ['parchment_edge', 'fine_line'],
        'palette_rules': {'max_colors': 4, 'saturation': 'low', 'mood': 'sepia'},
        'stroke_rules': {'width': 2, 'cap': 'round', 'color_mode': 'dark_outline'},
        'shadow_rules': {'style': 'soft_drop', 'opacity': 0.10},
        'detail_level': 'medium',
        'allowed_asset_types': ['marker', 'frame', 'pattern', 'badge', 'overlay'],
        'negative_rules': ['no_neon', 'no_cartoon_eyes'],
    },
    'sticker_toy': {
        'id': 'sticker_toy',
        'description': 'Stickerartige kindgerechte Elemente mit dicker Border.',
        'best_for': ['sticker', 'badge', 'frame', 'mascot'],
        'avoid_for': ['historical_atlas', 'diagram_symbol'],
        'shape_language': ['rounded', 'thick_border'],
        'palette_rules': {'max_colors': 5, 'saturation': 'high', 'mood': 'playful'},
        'stroke_rules': {'width': 6, 'cap': 'round', 'color_mode': 'white_border'},
        'shadow_rules': {'style': 'soft_drop', 'opacity': 0.20},
        'detail_level': 'low',
        'allowed_asset_types': ['sticker', 'badge', 'frame', 'mascot', 'icon'],
        'negative_rules': ['no_thin_lines', 'no_muted_palette'],
    },
}


_DEFAULT_DESIGN_TOKENS: dict[str, Any] = {
    'stroke_width': 4,
    'corner_roundness': 18,
    'shadow_style': 'soft_drop',
    'outline_color': '#24324A',
    'highlight_style': 'soft_top_left',
    'eye_style': 'large_sparkle',
    'sticker_border': True,
    'max_colors': 5,
    'detail_level': 'low',
    'shape_roundness': 'high',
    'line_cap': 'round',
}


_DEFAULT_PALETTE: dict[str, str] = {
    'background': '#F8F4EE',
    'surface': '#FFFFFF',
    'primary': '#3F6FE0',
    'secondary': '#FFB347',
    'accent': '#E04F8F',
    'text': '#1F2A44',
}


def list_style_families() -> list[dict[str, Any]]:
    """Liste aller verfügbaren Style Families als kompaktes Dict-Array."""
    return [
        {
            'id': fam['id'],
            'description': fam['description'],
            'best_for': fam['best_for'],
            'detail_level': fam['detail_level'],
        }
        for fam in STYLE_FAMILIES.values()
    ]


def get_style_family(family_id: str) -> dict[str, Any] | None:
    return STYLE_FAMILIES.get((family_id or '').strip().lower())


def style_family_from_dna(style_dna: dict[str, Any] | None) -> str:
    """Heuristische Auswahl der Style Family aus der Style DNA des Boards.

    Wenn ``style_dna`` leer ist, wird ``soft_cartoon`` als universelle Default-
    Familie zurückgegeben.
    """

    dna = style_dna or {}
    if not isinstance(dna, dict):
        return 'soft_cartoon'

    # Direktes Token-Mapping
    explicit = (dna.get('asset_style_family') or dna.get('style_family') or '').strip().lower()
    if explicit and explicit in STYLE_FAMILIES:
        return explicit

    age_style = (dna.get('age_style') or '').lower()
    interaction_style = (dna.get('interaction_style') or '').lower()
    visual_metaphor = (dna.get('visual_metaphor') or '').lower()
    layout_principle = (dna.get('layout_principle') or '').lower()
    mood = (dna.get('mood') or '').lower()
    shape_language = (dna.get('shape_language') or '').lower()

    blob = ' '.join([age_style, interaction_style, visual_metaphor, layout_principle, mood, shape_language])

    if any(k in blob for k in ('atlas', 'historisch', 'grenz', 'sepia', 'parchment', 'museum')):
        return 'historical_atlas'
    if any(k in blob for k in ('handgezeichnet', 'tafel', 'sketch', 'rough', 'chalk')):
        return 'rough_handdrawn'
    if any(k in blob for k in ('labor', 'experiment', 'science', 'forschung', 'mikroskop')):
        return 'science_lab_cartoon'
    if any(k in blob for k in ('storybook', 'märchen', 'erzähl', 'illustration')):
        return 'storybook_flat'
    if any(k in blob for k in ('sticker', 'toy', 'cute', 'monster', 'kindgerecht', 'grundschule', 'primary')):
        return 'sticker_toy' if 'sticker' in blob else 'cute_round_mascot'
    if any(k in blob for k in ('infografik', 'flat', 'clean', 'modern', 'professionell', 'sekundar')):
        return 'clean_flat'
    if any(k in blob for k in ('icon', 'unterricht', 'klassen')):
        return 'classroom_icon'

    return 'soft_cartoon'


def design_tokens_from_dna(style_dna: dict[str, Any] | None, family_id: str | None = None) -> dict[str, Any]:
    """Leitet Design Tokens aus Style DNA + Style-Family-Defaults ab."""

    family = get_style_family(family_id or style_family_from_dna(style_dna)) or {}
    dna = style_dna or {}

    tokens = dict(_DEFAULT_DESIGN_TOKENS)
    stroke_rules = family.get('stroke_rules') or {}
    if isinstance(stroke_rules.get('width'), (int, float)):
        tokens['stroke_width'] = int(stroke_rules['width'])
    if stroke_rules.get('cap'):
        tokens['line_cap'] = stroke_rules['cap']
    if (family.get('palette_rules') or {}).get('max_colors'):
        tokens['max_colors'] = int(family['palette_rules']['max_colors'])
    tokens['detail_level'] = family.get('detail_level') or tokens['detail_level']
    tokens['shadow_style'] = (family.get('shadow_rules') or {}).get('style') or tokens['shadow_style']

    palette = palette_from_dna(dna)
    if palette.get('text'):
        tokens['outline_color'] = palette['text']

    if family.get('id') in ('cute_round_mascot', 'sticker_toy'):
        tokens['shape_roundness'] = 'high'
        tokens['sticker_border'] = family['id'] == 'sticker_toy'
    elif family.get('id') == 'clean_flat':
        tokens['shape_roundness'] = 'medium'
        tokens['sticker_border'] = False
    elif family.get('id') == 'historical_atlas':
        tokens['shape_roundness'] = 'low'
        tokens['sticker_border'] = False

    return tokens


def palette_from_dna(style_dna: dict[str, Any] | None) -> dict[str, str]:
    """Übernimmt vorhandene Palette aus Style DNA, sonst Default-Palette."""

    dna_palette = (style_dna or {}).get('palette') if isinstance(style_dna, dict) else None
    palette = dict(_DEFAULT_PALETTE)
    if isinstance(dna_palette, dict):
        for key in ('background', 'surface', 'primary', 'secondary', 'accent', 'text'):
            value = dna_palette.get(key)
            if isinstance(value, str) and value.strip():
                palette[key] = value.strip()
    return palette


def default_palette() -> dict[str, str]:
    return dict(_DEFAULT_PALETTE)


def default_design_tokens() -> dict[str, Any]:
    return dict(_DEFAULT_DESIGN_TOKENS)
