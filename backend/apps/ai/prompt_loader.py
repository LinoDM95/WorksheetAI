"""Lädt Markdown-Prompts und fügt vom Backend/Frontend gelieferte Variablen ein."""
from pathlib import Path
import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_PROMPTS_ROOT = Path(__file__).resolve().parent / 'prompts'
_SHARED_DIR = _PROMPTS_ROOT / 'shared'
_FORMATS_DIR = _PROMPTS_ROOT / 'formats'

_KONTEXT_ANCHOR = '## Kontext vom Lehrenden'
_OUTPUT_ANCHOR = '## Ausgabe-JSON (Kurzüberblick)'


def _worksheet_format_dir() -> Path:
    """Verzeichnis mit generation.md / review.md / page_regenerate.md für das gewählte Format."""
    name = getattr(settings, 'AI_PROMPT_WORKSHEET_FORMAT', 'html_a4_worksheet') or 'html_a4_worksheet'
    name = str(name).strip().replace('..', '').replace('/', '').replace('\\', '')
    if not name:
        name = 'html_a4_worksheet'
    path = _FORMATS_DIR / name
    if path.is_dir():
        return path
    fallback = _FORMATS_DIR / 'html_a4_worksheet'
    logger.warning(
        'AI_PROMPT_WORKSHEET_FORMAT %r: Pfad %s fehlt — Fallback %s',
        name,
        path,
        fallback,
    )
    return fallback


def _json_compact() -> bool:
    return getattr(settings, 'GEMINI_COMPACT_PROMPT_JSON', True)


def _json_block(obj) -> str:
    if _json_compact():
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    return json.dumps(obj, ensure_ascii=False, indent=2)


def _append_ref_material(base: str) -> str:
    ref_paths = ('formulierung_schule_dach.md', 'latex_katex_schule_reference.md')
    out = base
    for name in ref_paths:
        ref_path = _SHARED_DIR / name
        if ref_path.is_file():
            out += '\n\n---\n\n' + ref_path.read_text(encoding='utf-8')
    return out


def _teacher_block(request: dict) -> str:
    teacher = (request.get('teacher_prompt') or request.get('teacher_context') or '').strip()
    if not teacher:
        return '*(Kein zusätzlicher Freitext. Nutze ausschließlich die strukturierten Parameter.)*'
    return teacher


def build_worksheet_generation_prompt(
    request: dict,
    page_setup: dict,
    pattern: dict,
) -> str:
    path = _worksheet_format_dir() / 'generation.md'
    md = path.read_text(encoding='utf-8')
    teacher = _teacher_block(request)
    base = (
        md.replace('{{TEACHER_CONTEXT}}', teacher)
        .replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
    )
    return _append_ref_material(base)


def build_worksheet_generation_prompt_for_gemini(
    request: dict,
    page_setup: dict,
    pattern: dict,
) -> tuple[str | None, str]:
    """Liefert (system_instruction_oder_None, user_inhalt).

    Mit ``GEMINI_PROMPT_SPLIT_SYSTEM_USER`` werden statische Regeln und Referenzen
    in ``system_instruction`` gelegt, Lehrer-Kontext + JSON-Parameter in die Nutzer-Nachricht
    — spart bei langen Aufträgen Kontext und entspricht der API-Empfehlung.
    """
    mono = build_worksheet_generation_prompt(request, page_setup, pattern)
    if not getattr(settings, 'GEMINI_PROMPT_SPLIT_SYSTEM_USER', True):
        return None, mono

    path = _worksheet_format_dir() / 'generation.md'
    md = path.read_text(encoding='utf-8')
    if _KONTEXT_ANCHOR not in md or _OUTPUT_ANCHOR not in md:
        return None, mono

    ik = md.index(_KONTEXT_ANCHOR)
    io = md.index(_OUTPUT_ANCHOR)
    head = md[:ik].strip()
    variable_mid = md[ik:io].strip()
    foot = md[io:].strip()

    teacher = _teacher_block(request)
    user_text = (
        variable_mid.replace('{{TEACHER_CONTEXT}}', teacher)
        .replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
    )

    system_core = _append_ref_material(head + '\n\n---\n\n' + foot)
    return system_core, user_text


def build_worksheet_review_prompt(
    content: dict,
    request: dict,
    page_setup: dict,
    pattern: dict,
) -> str:
    """Zweiter LLM-Durchgang: Logik, Lückentext, Linien, Fläche, Fach-Kohärenz."""
    path = _worksheet_format_dir() / 'review.md'
    md = path.read_text(encoding='utf-8')
    return (
        md.replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
        .replace('{{WORKSHEET_JSON}}', _json_block(content))
    )


def build_page_regeneration_prompt(payload: dict) -> str:
    """Eine Seite neu generieren: Kontext + aktuelle Seite + Lehrerhinweis."""
    path = _worksheet_format_dir() / 'page_regenerate.md'
    md = path.read_text(encoding='utf-8')
    meta = payload.get('worksheet_meta') or {}
    instr = (payload.get('teacher_instruction') or '').strip()
    if not instr:
        instr = '*(Keine zusätzliche Lehrer-Anweisung. Bitte Seite inhaltlich und strukturell sinnvoll neu gestalten.)*'
    base = (
        md.replace('{{WORKSHEET_META_JSON}}', _json_block(meta))
        .replace('{{PAGE_INDEX}}', str(payload.get('page_index', 0)))
        .replace('{{PAGE_TOTAL}}', str(payload.get('page_total', 1)))
        .replace('{{OTHER_PAGES_SUMMARY}}', str(payload.get('other_pages_summary') or '(keine weiteren Seiten)'))
        .replace('{{CURRENT_PAGE_JSON}}', _json_block(payload.get('current_page') or {}))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(payload.get('page_setup') or {}))
        .replace('{{PRESENTATION_JSON}}', _json_block(payload.get('presentation') or {}))
        .replace('{{TEACHER_INSTRUCTION}}', instr)
    )
    ref_path = _SHARED_DIR / 'latex_katex_schule_reference.md'
    if ref_path.is_file():
        base += '\n\n---\n\n' + ref_path.read_text(encoding='utf-8')
    return base
