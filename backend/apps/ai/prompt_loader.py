"""Lädt Markdown-Prompts und fügt vom Backend/Frontend gelieferte Variablen ein."""
from pathlib import Path
import json

_PROMPTS_DIR = Path(__file__).resolve().parent / 'prompts'


def _json_block(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def build_worksheet_generation_prompt(
    request: dict,
    page_setup: dict,
    pattern: dict,
) -> str:
    path = _PROMPTS_DIR / 'worksheet_generation.md'
    md = path.read_text(encoding='utf-8')
    teacher = (request.get('teacher_prompt') or request.get('teacher_context') or '').strip()
    if not teacher:
        teacher = (
            '*(Kein zusätzlicher Freitext. Nutze ausschließlich die strukturierten Parameter.)*'
        )
    base = (
        md.replace('{{TEACHER_CONTEXT}}', teacher)
        .replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
    )
    ref_paths = ('formulierung_schule_dach.md', 'latex_katex_schule_reference.md')
    for name in ref_paths:
        ref_path = _PROMPTS_DIR / name
        if ref_path.is_file():
            base += '\n\n---\n\n' + ref_path.read_text(encoding='utf-8')
    return base


def build_worksheet_review_prompt(
    content: dict,
    request: dict,
    page_setup: dict,
    pattern: dict,
) -> str:
    """Zweiter LLM-Durchgang: Logik, Lückentext, Linien, Fläche, Fach-Kohärenz."""
    path = _PROMPTS_DIR / 'worksheet_review.md'
    md = path.read_text(encoding='utf-8')
    return (
        md.replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
        .replace('{{WORKSHEET_JSON}}', _json_block(content))
    )


def build_page_regeneration_prompt(payload: dict) -> str:
    """Eine Seite neu generieren: Kontext + aktuelle Seite + Lehrerhinweis."""
    path = _PROMPTS_DIR / 'worksheet_page_regenerate.md'
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
    ref_path = _PROMPTS_DIR / 'latex_katex_schule_reference.md'
    if ref_path.is_file():
        base += '\n\n---\n\n' + ref_path.read_text(encoding='utf-8')
    return base
