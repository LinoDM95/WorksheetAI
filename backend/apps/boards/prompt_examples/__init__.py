"""Golden Examples für den Smartboard-Kreativmodus.

Das Modul liefert ``pick_golden_example(intent)`` — wählt eine kompakte Markdown-
Datei aus :mod:`backend.apps.boards.prompt_examples` als Inspirations-Beispiel für
das Generation-Prompt. Die Markdown-Dateien enthalten **keine** vollständigen
Boards, sondern nur Struktur-/Style-/Touch-Skizzen.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

_DIR = Path(__file__).resolve().parent

_BY_KEY = {
    'math': 'math_fraction_board.md',
    'history': 'history_timeline_board.md',
    'primary': 'primary_water_cycle_board.md',
    'science': 'science_simulation_board.md',
    'language': 'language_dragdrop_board.md',
}


def pick_golden_example(intent: dict[str, Any] | None) -> str | None:
    """Liefert den Inhalt einer passenden ``*.md``-Datei oder ``None``."""
    if not intent:
        return None
    area = str(intent.get('subject_area') or '').lower()
    file_name = _BY_KEY.get(area)
    if not file_name:
        return None
    path = _DIR / file_name
    if not path.is_file():
        return None
    text = path.read_text(encoding='utf-8')
    # Hartes Limit, damit Beispiele den Prompt nicht sprengen.
    return text[:3000]
