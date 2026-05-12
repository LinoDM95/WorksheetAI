"""Registry der lokalen Sandbox-Ressourcen, die im Free-HTML-Modus genutzt werden dürfen.

Die KI bekommt im Prompt-Kontext genau diese Listen — sie darf NUR diese IDs in
``used_libraries`` / ``used_assets`` / ``used_datasets`` zurückmelden, und sie darf
externe URLs nicht laden. Die Frontend-Sandbox bindet die Libraries/Datasets aus
``frontend/public/board-libs``, ``frontend/public/board-datasets`` und
``frontend/public/board-assets`` (Icons unter ``icons/``, optional Sounds unter ``sounds/``) ein.
"""
from __future__ import annotations

from typing import Any

LIBRARIES: list[dict[str, Any]] = [
    {
        'id': 'd3',
        'global': 'd3',
        'always': True,
        'use_for': ['svg', 'charts', 'maps', 'animations', 'data_visualization'],
        'note': 'Global verfügbar als window.d3.',
    },
    {
        'id': 'roughjs',
        'global': 'rough',
        'always': True,
        'use_for': ['handdrawn_shapes', 'sketch_style', 'arrows', 'boxes'],
        'note': 'Global verfügbar als window.rough.',
    },
    {
        'id': 'chartjs',
        'global': 'Chart',
        'always': False,
        'use_for': [
            'bar_line_area_charts',
            'pie_doughnut_charts',
            'dashboard_widgets',
            'multiple_charts_layout',
            'readable_axes_legends',
        ],
        'note': (
            'Chart.js (Canvas) als window.Chart — nur laden wenn genutzt: chartjs in used_libraries. '
            'Für freie SVG-/Geo-Visualisierung weiter d3 bevorzugen.'
        ),
    },
    {
        'id': 'leaflet',
        'global': 'L',
        'always': False,
        'use_for': ['interactive_maps', 'markers', 'geojson_layers'],
        'note': 'Nur laden, wenn die Lehrkraft eine echte Karte braucht. Ohne externe Tiles, lokale Datasets bevorzugen.',
    },
    {
        'id': 'turf',
        'global': 'turf',
        'always': False,
        'use_for': ['geometry', 'centroid', 'bbox', 'simple_geo'],
        'note': 'Optional, nur bei Geo-Berechnungen.',
    },
    {
        'id': 'topojson',
        'global': 'topojson',
        'always': False,
        'use_for': ['topojson_conversion'],
        'note': 'Optional, nur wenn TopoJSON-Datasets genutzt werden.',
    },
    {
        'id': 'interactjs',
        'global': 'interact',
        'always': False,
        'use_for': [
            'drag_drop_dom',
            'multi_touch',
            'resize_rotate_dom',
            'sort_puzzle_touch',
            'simultaneous_pointers_classroom',
        ],
        'note': (
            'Touch/Pointer-Drag auf DOM-Elementen; Mehrfinger (gesturable). Für Ziele '
            '`touch-action: none` auf dem ziehbaren Element setzen.'
        ),
    },
    {
        'id': 'matterjs',
        'global': 'Matter',
        'always': False,
        'use_for': ['physics_2d', 'ramps_collision', 'stacking_mass', 'simple_sim_lab'],
        'note': (
            '`Matter.Engine` + `render`/`Runner` oder eigenes RAF; Körper begrenzen; '
            'Canvas klar unter `.free-board` dimensionieren.'
        ),
    },
    {
        'id': 'gsap',
        'global': 'gsap',
        'always': False,
        'use_for': ['timeline_animation', 'staged_story', 'documentary_motion', 'ui_micro_motion'],
        'note': (
            'Nur **GSAP Core** (`gsap.to`, `timeline`) — **keine** Club-/kostenpflichtigen Plugins '
            'erwähnen oder voraussetzen; es sind nur `gsap.min.js` gebündelt.'
        ),
    },
    {
        'id': 'confetti',
        'global': 'confetti',
        'always': False,
        'use_for': ['reward_feedback', 'celebration_primary', 'goal_reached'],
        'note': 'Globale Funktion `confetti({ ... })`; sparsam nutzen, nach erstem Tap auslösen.',
    },
    {
        'id': 'howler',
        'global': 'Howl',
        'always': False,
        'use_for': ['short_sfx', 'applause_hint', 'correct_wrong_audio'],
        'note': (
            'Konstruktor `new Howl({ src: [\'/board-assets/sounds/…\'] })` — nur **lokale** '
            'Pfade unter `/board-assets/`; kein externes Audio. Erst nach Nutzer-Tap abspielen '
            '(Autoplay-Policy). Howler nutzt intern XHR — nur für gelieferte Dateien.'
        ),
    },
    {
        'id': 'konva',
        'global': 'Konva',
        'always': False,
        'use_for': ['mindmap_canvas', 'many_shapes_lines', 'layered_2d_stage'],
        'note': (
            '2D-Canvas-Stage; Container-Div im HTML, feste Größe in px; nach Stage-Resize '
            '`stage.width()`/`height()` ggf. anpassen.'
        ),
    },
    {
        'id': 'phaser',
        'global': 'Phaser',
        'always': False,
        'use_for': [
            'mini_games',
            'sprites_scenes',
            'arcade_style_interaction',
            '2d_game_loop',
        ],
        'note': (
            'Phaser 4 als window.Phaser — nur bei echtem Spiel-/Szenenbedarf; Bühne in '
            '`.free-board` halten, Touch-first, keine externen Assets. Nicht parallel zu '
            'einer zweiten schweren Engine nötig — eine Engine pro Board bevorzugen.'
        ),
    },
    {
        'id': 'pixi',
        'global': 'PIXI',
        'always': False,
        'use_for': [
            'webgl_canvas_2d',
            'particle_simple_graphics',
            'custom_sprite_stage',
        ],
        'note': (
            'PixiJS 8 — typisch `PIXI.Application` / Renderer; globales Namespace `PIXI`. '
            'Kein CDN; nur lokales Bundle. Mit Phaser/Konva nicht doppelt einplanen, wenn '
            'eine Library reicht.'
        ),
    },
]

ASSETS: list[dict[str, Any]] = [
    {'id': 'sun_soft', 'label': 'Sonne', 'path': '/board-assets/icons/sun_soft.svg', 'tags': ['weather', 'water_cycle', 'primary']},
    {'id': 'cloud_soft', 'label': 'Wolke', 'path': '/board-assets/icons/cloud_soft.svg', 'tags': ['weather', 'water_cycle']},
    {'id': 'mountain', 'label': 'Berg', 'path': '/board-assets/icons/mountain.svg', 'tags': ['landscape', 'water_cycle']},
    {'id': 'water', 'label': 'Wasser', 'path': '/board-assets/icons/water.svg', 'tags': ['water', 'water_cycle']},
    {'id': 'arrow', 'label': 'Pfeil', 'path': '/board-assets/icons/arrow.svg', 'tags': ['process', 'flow']},
    {'id': 'pin', 'label': 'Marker', 'path': '/board-assets/icons/pin.svg', 'tags': ['map', 'hotspot']},
    {'id': 'flag', 'label': 'Fahne', 'path': '/board-assets/icons/flag.svg', 'tags': ['map', 'history']},
    {'id': 'document', 'label': 'Dokument', 'path': '/board-assets/icons/document.svg', 'tags': ['quelle', 'history']},
    {'id': 'magnifier', 'label': 'Lupe', 'path': '/board-assets/icons/magnifier.svg', 'tags': ['research', 'detail']},
    {'id': 'star', 'label': 'Stern', 'path': '/board-assets/icons/star.svg', 'tags': ['decoration', 'reward']},
    {'id': 'lab_flask', 'label': 'Erlenmeyerkolben', 'path': '/board-assets/icons/lab_flask.svg', 'tags': ['science', 'chemistry']},
    {'id': 'atom', 'label': 'Atom', 'path': '/board-assets/icons/atom.svg', 'tags': ['science', 'physics']},
    {'id': 'calculator', 'label': 'Taschenrechner', 'path': '/board-assets/icons/calculator.svg', 'tags': ['math']},
    {'id': 'book', 'label': 'Buch', 'path': '/board-assets/icons/book.svg', 'tags': ['language', 'literature']},
    {'id': 'friendly_monster', 'label': 'Freundliches Wesen', 'path': '/board-assets/icons/friendly_monster.svg', 'tags': ['primary', 'mascot']},
    {'id': 'tree', 'label': 'Baum', 'path': '/board-assets/icons/tree.svg', 'tags': ['biology', 'water_cycle']},
    {'id': 'raindrop', 'label': 'Regentropfen', 'path': '/board-assets/icons/raindrop.svg', 'tags': ['weather', 'water_cycle']},
]

DATASETS: list[dict[str, Any]] = [
    {
        'id': 'europe_ww2_demo',
        'label': 'Europa im Zweiten Weltkrieg — vereinfachte Unterrichtsdarstellung',
        'type': 'schematic_map',
        'accuracy': 'schematic_demo',
        'warning': 'Vereinfachte Unterrichtsdarstellung, keine amtliche historische Grenzkarte.',
        'available_steps': ['1938', '1939', '1941', '1945'],
        'data_url': '/board-datasets/europe_ww2_demo.json',
    },
    {
        'id': 'germany_unification_demo',
        'label': 'Deutsche Einheit 1989/1990 — schematisch',
        'type': 'schematic_map',
        'accuracy': 'schematic_demo',
        'warning': 'Vereinfachte Unterrichtsdarstellung, keine amtliche Karte.',
        'available_steps': ['1989_october', '1989_november', '1990_october'],
        'data_url': '/board-datasets/germany_unification_demo.json',
    },
    {
        'id': 'water_cycle_scene',
        'label': 'Wasserkreislauf — Szenenbeschreibung',
        'type': 'scene',
        'accuracy': 'didactic_simplified',
        'warning': 'Didaktische Vereinfachung des Wasserkreislaufs.',
        'available_steps': ['evaporation', 'condensation', 'precipitation', 'runoff'],
        'data_url': '/board-datasets/water_cycle_scene.json',
    },
    {
        'id': 'europe_outline_geojson',
        'label': 'Europa — Grobumriss als GeoJSON (WGS84, stark vereinfacht)',
        'type': 'geojson',
        'accuracy': 'schematic_demo',
        'warning': 'Extrem vereinfachte Silhouette für D3/Projektionen, keine Grenzkarte.',
        'available_steps': [],
        'data_url': '/board-datasets/europe_outline_geojson.json',
    },
    {
        'id': 'germany_outline_geojson',
        'label': 'Deutschland — Umriss als GeoJSON (WGS84, schematisch)',
        'type': 'geojson',
        'accuracy': 'schematic_demo',
        'warning': 'Didaktische Vereinfachung, keine amtliche Grenze.',
        'available_steps': [],
        'data_url': '/board-datasets/germany_outline_geojson.json',
    },
]

LIBRARY_IDS = {lib['id'] for lib in LIBRARIES}
ASSET_IDS = {a['id'] for a in ASSETS}
DATASET_IDS = {d['id'] for d in DATASETS}


def filter_used_libraries(ids: list[str] | None) -> list[str]:
    if not isinstance(ids, list):
        return []
    return [str(i) for i in ids if str(i) in LIBRARY_IDS]


def filter_used_assets(ids: list[str] | None) -> list[str]:
    if not isinstance(ids, list):
        return []
    return [str(i) for i in ids if str(i) in ASSET_IDS]


def filter_used_datasets(ids: list[str] | None) -> list[str]:
    if not isinstance(ids, list):
        return []
    return [str(i) for i in ids if str(i) in DATASET_IDS]


def summarize_libraries() -> str:
    """Kurze Markdown-Liste für den Prompt — nennt globalen Namen + Einsatzgebiet."""
    lines = []
    for lib in LIBRARIES:
        always = ' (immer geladen)' if lib.get('always') else ' (optional, nur wenn benötigt)'
        uses = ', '.join(lib.get('use_for') or [])
        lines.append(f"- `{lib['id']}` → window.{lib['global']}{always}; geeignet für: {uses}.")
    return '\n'.join(lines)


def summarize_assets() -> str:
    lines = []
    for a in ASSETS:
        tags = ', '.join(a.get('tags') or [])
        lines.append(f"- `{a['id']}` → {a['path']} — {a['label']} ({tags})")
    return '\n'.join(lines)


def summarize_datasets() -> str:
    lines = []
    for d in DATASETS:
        steps = ', '.join(d.get('available_steps') or [])
        lines.append(
            f"- `{d['id']}` → {d['data_url']} — {d['label']}; Genauigkeit: {d.get('accuracy')}; "
            f"Schritte: {steps}; Hinweis: {d.get('warning')}"
        )
    return '\n'.join(lines)


def always_loaded_library_ids() -> list[str]:
    return [lib['id'] for lib in LIBRARIES if lib.get('always')]
