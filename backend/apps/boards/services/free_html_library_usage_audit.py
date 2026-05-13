"""Heuristische Prüfung: typische Sandbox-Globals ohne passenden ``used_libraries``-Eintrag."""
from __future__ import annotations

import re
from typing import Any

from .visual_resource_registry import filter_used_libraries

_LIBRARY_TRIGGERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ('interactjs', re.compile(r'\binteract\s*\(')),
    ('matterjs', re.compile(r'\bMatter\.')),
    ('gsap', re.compile(r'\bgsap\.')),
    ('confetti', re.compile(r'\bconfetti\s*\(|window\.confetti\b')),
    ('konva', re.compile(r'\bKonva\.|\bnew\s+Konva\b')),
    ('howler', re.compile(r'\bnew\s+Howl\s*\(')),
    ('phaser', re.compile(r'\bPhaser\.')),
    ('pixi', re.compile(r'\bPIXI\.')),
    ('chartjs', re.compile(r'\bnew\s+Chart\s*\(|window\.Chart\b')),
    ('leaflet', re.compile(r'\bL\.map\s*\(')),
)


def audit_optional_library_usage(bundle: dict[str, Any]) -> list[str]:
    """Liefert menschenlesbare Hinweise für den Repair-Prompt (keine strukturelle Validator-Lesezeichenpflicht)."""
    js = str(bundle.get('javascript') or '')
    if not js.strip():
        return []
    used = set(filter_used_libraries(bundle.get('used_libraries')))
    out: list[str] = []
    for lib_id, pattern in _LIBRARY_TRIGGERS:
        if lib_id in used:
            continue
        if pattern.search(js):
            out.append(
                f'[Skript] Das JavaScript enthält Aufrufe/API für „{lib_id}“, aber '
                f'„{lib_id}“ fehlt in used_libraries — Eintrag ergänzen oder Code durch '
                f'Vanilla/d3 ersetzen bzw. mit typeof-Guard absichern.'
            )
    return out
