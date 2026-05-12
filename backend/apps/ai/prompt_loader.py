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


def _append_teacher_visual_quality_supplement(base: str) -> str:
    """Gekürzte UI/A11y-Ergänzung; immer nach Produkt-Hauptprompts (Rangfolge im Markdown)."""
    path = _SHARED_DIR / 'teacher_visual_quality_supplement.md'
    if not path.is_file():
        return base
    return base + '\n\n---\n\n' + path.read_text(encoding='utf-8')


def _append_ref_material(base: str) -> str:
    ref_paths = (
        'formulierung_schule_dach.md',
        'latex_katex_schule_reference.md',
        'teacher_visual_quality_supplement.md',
    )
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


def _curriculum_context_markdown(curriculum_context: dict | None) -> str:
    if not curriculum_context:
        return (
            '*Für diese Generierung liegt **kein** aktiver Lehrplan-Kontext vor.* '
            'Erstelle das Arbeitsblatt wie gewohnt aus den strukturierten Parametern und dem Lehrer-Prompt.'
        )
    return (
        'Nutze folgenden **Curriculum-Kontext** als fachliche und didaktische Leitplanke. '
        'Erstelle Aufgaben nur passend zu Fach, Klassenband, Themenfeld, Unterthemen, Kompetenzen, '
        'erlaubten Aufgabentypen, sprachlichen Hinweisen und Validierungsregeln — keine offensichtlich '
        'passungslosen Inhalte, außer der Nutzer fordert ausdrücklich ein abweichendes Niveau oder andere Schwerpunkte.\n\n'
        '```json\n'
        + _json_block(curriculum_context)
        + '\n```\n\n'
        'Im Ausgabe-JSON: fülle optional das Feld **`curriculum_alignment`** (nur für die Software sichtbar, '
        'nicht für Schüler:innen auf dem Druckblatt): kurz welche Bereiche du aus diesem Kontext genutzt hast.'
    )


def _worksheet_creative_html_dir() -> Path:
    return _FORMATS_DIR / 'worksheet_creative_html'


def build_worksheet_creative_html_generation_prompt(
    request: dict,
    page_setup: dict,
    curriculum_context: dict | None = None,
) -> str:
    path = _worksheet_creative_html_dir() / 'generation.md'
    md = path.read_text(encoding='utf-8')
    teacher = _teacher_block(request)
    cc_block = _curriculum_context_markdown(curriculum_context)
    base = (
        md.replace('{{TEACHER_CONTEXT}}', teacher)
        .replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{CURRICULUM_CONTEXT_BLOCK}}', cc_block)
    )
    return _append_teacher_visual_quality_supplement(base)


def build_worksheet_creative_html_generation_prompt_for_gemini(
    request: dict,
    page_setup: dict,
    curriculum_context: dict | None = None,
) -> tuple[str | None, str]:
    mono = build_worksheet_creative_html_generation_prompt(request, page_setup, curriculum_context)
    if not getattr(settings, 'GEMINI_PROMPT_SPLIT_SYSTEM_USER', True):
        return None, mono

    path = _worksheet_creative_html_dir() / 'generation.md'
    md = path.read_text(encoding='utf-8')
    if _KONTEXT_ANCHOR not in md or _OUTPUT_ANCHOR not in md:
        return None, mono

    ik = md.index(_KONTEXT_ANCHOR)
    io = md.index(_OUTPUT_ANCHOR)
    head = md[:ik].strip()
    variable_mid = md[ik:io].strip()
    foot = md[io:].strip()

    teacher = _teacher_block(request)
    cc_block = _curriculum_context_markdown(curriculum_context)
    user_text = (
        variable_mid.replace('{{TEACHER_CONTEXT}}', teacher)
        .replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{CURRICULUM_CONTEXT_BLOCK}}', cc_block)
    )

    system_core = _append_teacher_visual_quality_supplement(head + '\n\n---\n\n' + foot)
    return system_core, user_text


def build_worksheet_creative_html_page_regeneration_prompt(payload: dict) -> str:
    path = _worksheet_creative_html_dir() / 'page_regenerate.md'
    md = path.read_text(encoding='utf-8')
    meta = payload.get('worksheet_meta') or {}
    instr = (payload.get('teacher_instruction') or '').strip()
    if not instr:
        instr = '*(Keine zusätzliche Lehrer-Anweisung. Bitte Seite inhaltlich und strukturell sinnvoll neu gestalten.)*'
    style_ref = str(
        payload.get('other_pages_style_reference')
        or '(Keine weiteren Seiten mit HTML — kein zusätzlicher Stilabgleich nötig.)'
    ).strip()
    base = (
        md.replace('{{WORKSHEET_META_JSON}}', _json_block(meta))
        .replace('{{PAGE_INDEX}}', str(payload.get('page_index', 0)))
        .replace('{{PAGE_TOTAL}}', str(payload.get('page_total', 1)))
        .replace('{{DOCUMENT_OUTLINE}}', str(payload.get('document_outline') or '(keine Übersicht)'))
        .replace('{{OTHER_PAGES_SUMMARY}}', str(payload.get('other_pages_summary') or '(keine weiteren Seiten)'))
        .replace('{{OTHER_PAGES_STYLE_REFERENCE}}', style_ref)
        .replace('{{CURRENT_PAGE_JSON}}', _json_block(payload.get('current_page') or {}))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(payload.get('page_setup') or {}))
        .replace('{{TEACHER_INSTRUCTION}}', instr)
    )
    return _append_teacher_visual_quality_supplement(base)


def build_worksheet_generation_prompt(
    request: dict,
    page_setup: dict,
    pattern: dict,
    curriculum_context: dict | None = None,
) -> str:
    path = _worksheet_format_dir() / 'generation.md'
    md = path.read_text(encoding='utf-8')
    teacher = _teacher_block(request)
    cc_block = _curriculum_context_markdown(curriculum_context)
    base = (
        md.replace('{{TEACHER_CONTEXT}}', teacher)
        .replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
        .replace('{{CURRICULUM_CONTEXT_BLOCK}}', cc_block)
    )
    return _append_ref_material(base)


def build_worksheet_generation_prompt_for_gemini(
    request: dict,
    page_setup: dict,
    pattern: dict,
    curriculum_context: dict | None = None,
) -> tuple[str | None, str]:
    """Liefert (system_instruction_oder_None, user_inhalt).

    Mit ``GEMINI_PROMPT_SPLIT_SYSTEM_USER`` werden statische Regeln und Referenzen
    in ``system_instruction`` gelegt, Lehrer-Kontext + JSON-Parameter in die Nutzer-Nachricht
    — spart bei langen Aufträgen Kontext und entspricht der API-Empfehlung.
    """
    mono = build_worksheet_generation_prompt(request, page_setup, pattern, curriculum_context)
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
    cc_block = _curriculum_context_markdown(curriculum_context)
    user_text = (
        variable_mid.replace('{{TEACHER_CONTEXT}}', teacher)
        .replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
        .replace('{{CURRICULUM_CONTEXT_BLOCK}}', cc_block)
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
    base = (
        md.replace('{{REQUEST_JSON}}', _json_block(request))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(page_setup))
        .replace('{{PATTERN_JSON}}', _json_block(pattern))
        .replace('{{WORKSHEET_JSON}}', _json_block(content))
    )
    return _append_teacher_visual_quality_supplement(base)


_BOARD_FORMAT_DIR = _FORMATS_DIR / 'interactive_board'


# Vor jedem Repair-Modus-Prompt (RepairAgent / spezialisierte Revision): keine willkürliche Reduktion von Slides o. Ä.
_REPAIR_CONTENT_PRESERVATION_PREAMBLE = """## Schutzregel: Kein unkontrolliertes Kürzen

- **Kein Inhaltsverlust ohne klaren Lehrkraft-Auftrag:** Entferne oder überspringe **keine** Folien/Slides, Szenen, Spielebenen, Fragen oder zentralen Inhaltsblöcke und ändere **nicht** **Anzahl** oder **Reihenfolge**, es sei denn, im **Lehrkraft-Hinweis** / **Zusatzkontext** ist das **ausdrücklich** gewünscht (z. B. „nur noch acht Folien“, „Übungen 3–5 entfernen“).
- **Modus „vereinfachen“ u. Ä.** bezieht sich auf **verständlichere Texte/UI**, schlankeren Code, **lokale** Animation/Text-Straffung — **nicht** darauf, das Board ohne Anweisung kürzer oder ärmer zu machen.

## Ausgabe: surgical vs. full

Bei **kleinen** Korrekturen bevorzuge **`revision_kind`: `"surgical"`** mit **`surgical_edits`** (exakte `old_text`-Ausschnitte aus dem obigen Code). Bei **größeren** Änderungen **`revision_kind`: `"full"`** und vollständige `html`/`css`/`javascript`. Sparsamere Ausgabe = weniger Tokens — wie bei der normalen Board-Revision.

"""

def _board_format_dir() -> Path:
    if _BOARD_FORMAT_DIR.is_dir():
        return _BOARD_FORMAT_DIR
    logger.warning('interactive_board prompt dir fehlt: %s', _BOARD_FORMAT_DIR)
    return _BOARD_FORMAT_DIR


def _truncate_block(s: str, max_chars: int = 14_000) -> str:
    t = s or ''
    if len(t) <= max_chars:
        return t
    return t[:max_chars] + '\n\n… (gekürzt für Prompt-Länge)'


def _revision_board_generation_prompt_excerpt(payload: dict) -> str:
    """Auszug der gespeicherten Lehrer-Beschreibung für Revision/Repair (Länge begrenzt)."""
    gp = str(payload.get('board_generation_prompt') or '').strip()
    cap = max(500, int(getattr(settings, 'AI_BOARD_REVISION_DIDACTIC_MAX_CHARS', 6000)))
    if not gp:
        return (
            '*(Keine gespeicherte ausführliche Beschreibung — nutze Fach/Thema oben und den '
            'vorhandenen Code.)*'
        )
    if len(gp) > cap:
        return gp[:cap] + '\n\n… (gekürzt für Prompt-Länge)'
    return gp


def _board_didactic_markdown_block(payload: dict) -> str:
    """Optionaler Markdown-Block: didaktischer Ursprung (RepairAgent / klassischer Repair)."""
    sub = str(payload.get('board_subject') or '').strip()
    grade = str(payload.get('board_grade') or '').strip()
    topic = str(payload.get('board_topic') or '').strip()
    gp_raw = str(payload.get('board_generation_prompt') or '').strip()
    if not sub and not grade and not topic and not gp_raw:
        return ''
    cap = max(500, int(getattr(settings, 'AI_BOARD_REVISION_DIDACTIC_MAX_CHARS', 6000)))
    if gp_raw and len(gp_raw) > cap:
        gp_excerpt = gp_raw[:cap] + '\n\n… (gekürzt für Prompt-Länge)'
    else:
        gp_excerpt = gp_raw
    if not gp_excerpt:
        gp_excerpt = (
            '*(Keine gespeicherte Beschreibung — nutze Fach/Thema und den bestehenden Code.)*'
        )
    lines = [
        '## Ursprünglicher didaktischer Kontext',
        '',
        '**Richtlinie:** Inhaltlich beim **gleichen** Auftrag bleiben (Fach/Thema). Kein '
        'Themenwechsel — nur Reparatur oder das, was der Zusatzkontext ausdrücklich verlangt.',
        '',
        f'- **Fach:** {sub or "— nicht angegeben —"}',
        f'- **Klassenstufe:** {grade or "— nicht angegeben —"}',
        f'- **Thema:** {topic or "— nicht angegeben —"}',
        '',
        '**Ursprüngliche Lehrer-Beschreibung:**',
        gp_excerpt,
        '',
    ]
    return '\n'.join(lines)


def build_block_filling_page_prompt(payload: dict) -> str:
    """Prompt für eine einzelne Board-Seite: Slots mit Stichpunkten → JSON contents."""
    md = (_board_format_dir() / 'blocks_filling.md').read_text(encoding='utf-8')
    base = md.replace('{{PAGE_PAYLOAD_JSON}}', _json_block(payload))
    return _append_teacher_visual_quality_supplement(base)


def _format_asset_pack_summary(value) -> str:
    """Formatiert das Asset-Pack-Summary-Dict als kompakten, KI-lesbaren Block."""
    if not value or not isinstance(value, dict):
        return '— kein Asset Pack vorhanden, freie Gestaltung erlaubt —'
    inline_brief = value.get('inline_asset_brief') or []
    assets = value.get('assets') or []
    if not inline_brief and not assets:
        return '— kein Asset Pack vorhanden, freie Gestaltung erlaubt —'
    lines: list[str] = []
    style_rules = value.get('style_rules') or {}
    if style_rules:
        lines.append(f"**Style Rules (global):** {style_rules}")
    usage_rules = value.get('usage_rules') or []
    if usage_rules:
        lines.append('**Usage Rules:**')
        for rule in usage_rules[:14]:
            lines.append(f'- {rule}')
    lines.append('')
    if inline_brief:
        lines.append(f'**Inline im Code zeichnen ({len(inline_brief)}):**')
        for item in inline_brief[:20]:
            if not isinstance(item, dict):
                continue
            lines.append(
                f'- `{item.get("key")}` ({item.get("asset_type")}): {item.get("title")} — '
                f'placement: {item.get("placement_hint", "free")}; Motiv: {item.get("subject_text", "")[:120]}'
            )
        lines.append('')
    if assets:
        lines.append(f'**Pack-Assets ({len(assets)}):**')
        for entry in assets[:24]:
            if not isinstance(entry, dict):
                continue
            key = entry.get('key') or '?'
            role = entry.get('role') or 'decoration'
            delivery = entry.get('delivery') or 'inline'
            width = entry.get('width') or '?'
            height = entry.get('height') or '?'
            size_hint = entry.get('size_hint') or ''
            head = f'- `{key}` (role: `{role}`, delivery: `{delivery}`, viewBox: {width}×{height}'
            if size_hint:
                head += f', size_hint: {size_hint}'
            head += ')'
            lines.append(head)
            if delivery == 'inline':
                inline_svg = (entry.get('inline_svg') or '').strip()
                if inline_svg:
                    lines.append('  inline_svg:')
                    lines.append('  ```svg')
                    lines.append('  ' + inline_svg.replace('\n', '\n  '))
                    lines.append('  ```')
            else:
                url = entry.get('url') or ''
                if url:
                    lines.append(f'  url: `{url}`')
    return '\n'.join(lines)


def build_free_html_generation_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'free_html_generation.md').read_text(encoding='utf-8')
    prompt = (payload.get('prompt') or '').strip() or '*(Kein Freitext.)*'

    def _block_or_dash(value) -> str:
        if value in (None, '', {}, []):
            return '— nicht aktiv —'
        if isinstance(value, str):
            return value
        return _json_block(value)

    filled = (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ board_type }}', str(payload.get('board_type') or 'interactive_board'))
        .replace('{{ duration_minutes }}', str(payload.get('duration_minutes') or 10))
        .replace('{{ creativity }}', str(payload.get('creativity') or 'experimentell'))
        .replace('{{ visual_style }}', str(payload.get('visual_style') or 'auto'))
        .replace('{{ target_device }}', str(payload.get('target_device') or 'smartboard'))
        .replace('{{ libraries_summary }}', str(payload.get('libraries_summary') or '— keine —'))
        .replace('{{ assets_summary }}', str(payload.get('assets_summary') or '— keine —'))
        .replace('{{ datasets_summary }}', str(payload.get('datasets_summary') or '— keine —'))
        .replace('{{ asset_pack_summary }}', _format_asset_pack_summary(payload.get('asset_pack_summary')))
        .replace('{{ intent }}', _block_or_dash(payload.get('intent')))
        .replace('{{ risk }}', _block_or_dash(payload.get('risk')))
        .replace('{{ creative_brief }}', _block_or_dash(payload.get('creative_brief')))
        .replace('{{ style_dna }}', _block_or_dash(payload.get('style_dna')))
        .replace('{{ snippets }}', str(payload.get('snippets') or '— keine —'))
        .replace('{{ golden_example }}', str(payload.get('golden_example') or '— keines —'))
        .replace('{{ prompt }}', prompt)
    )
    return _append_teacher_visual_quality_supplement(filled)


def build_free_html_revision_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'free_html_revision.md').read_text(encoding='utf-8')
    user_prompt = (payload.get('user_prompt') or '').strip() or '*(Kein Änderungswunsch.)*'
    cap = max(1_000, int(getattr(settings, 'AI_BOARD_FREE_HTML_REVISION_BLOCK_MAX_CHARS', 200_000)))
    gp_block = _revision_board_generation_prompt_excerpt(payload)
    filled = (
        md.replace('{{ html }}', _truncate_block(str(payload.get('html') or ''), cap))
        .replace('{{ css }}', _truncate_block(str(payload.get('css') or ''), cap))
        .replace('{{ javascript }}', _truncate_block(str(payload.get('javascript') or ''), cap))
        .replace('{{ libraries_summary }}', str(payload.get('libraries_summary') or '— keine —'))
        .replace('{{ assets_summary }}', str(payload.get('assets_summary') or '— keine —'))
        .replace('{{ datasets_summary }}', str(payload.get('datasets_summary') or '— keine —'))
        .replace('{{ prompt }}', user_prompt)
        .replace('{{ board_subject }}', str(payload.get('board_subject') or '— nicht angegeben —'))
        .replace('{{ board_grade }}', str(payload.get('board_grade') or '— nicht angegeben —'))
        .replace('{{ board_topic }}', str(payload.get('board_topic') or '— nicht angegeben —'))
        .replace('{{ board_generation_prompt }}', gp_block)
    )
    return _append_teacher_visual_quality_supplement(filled)


def build_free_html_repair_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'free_html_repair.md').read_text(encoding='utf-8')
    errs = payload.get('validation_errors') or []
    if isinstance(errs, list) and errs:
        err_block = '\n'.join(f'{i + 1}. {str(e).strip()}' for i, e in enumerate(errs))
    elif errs:
        err_block = str(errs)
    else:
        err_block = '*(Keine Fehlerliste übermittelt — prüfe den Code dennoch auf Sandbox-Konformität.)*'
    ctx = str(payload.get('context_hint') or '').strip() or '*(Kein Zusatzkontext.)*'
    filled = (
        md.replace('{{ validation_errors }}', err_block)
        .replace('{{ repair_attempt }}', str(int(payload.get('repair_attempt') or 1)))
        .replace('{{ repair_attempt_max }}', str(int(payload.get('repair_attempt_max') or 1)))
        .replace('{{ context_hint }}', ctx)
        .replace('{{ html }}', _truncate_block(str(payload.get('html') or '')))
        .replace('{{ css }}', _truncate_block(str(payload.get('css') or '')))
        .replace('{{ javascript }}', _truncate_block(str(payload.get('javascript') or '')))
        .replace('{{ libraries_summary }}', str(payload.get('libraries_summary') or '— keine —'))
        .replace('{{ assets_summary }}', str(payload.get('assets_summary') or '— keine —'))
        .replace('{{ datasets_summary }}', str(payload.get('datasets_summary') or '— keine —'))
    )
    didactic = _board_didactic_markdown_block(payload)
    merged = didactic + _append_teacher_visual_quality_supplement(filled)
    return merged


def build_intent_router_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'intent_router.md').read_text(encoding='utf-8')
    prompt = (payload.get('prompt') or '').strip() or '*(Kein Freitext.)*'
    return (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ prompt }}', prompt)
    )


def build_risk_classifier_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'risk_classifier.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ prompt }}', str(payload.get('prompt') or '*(Kein Freitext.)*'))
        .replace('{{ intent }}', _json_block(payload.get('intent') or {}))
    )


def build_creative_brief_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'creative_brief.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ prompt }}', str(payload.get('prompt') or '*(Kein Freitext.)*'))
        .replace('{{ intent }}', _json_block(payload.get('intent') or {}))
        .replace('{{ risk }}', _json_block(payload.get('risk') or {}))
    )


def build_style_dna_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'style_dna.md').read_text(encoding='utf-8')
    filled = (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ prompt }}', str(payload.get('prompt') or '*(Kein Freitext.)*'))
        .replace('{{ intent }}', _json_block(payload.get('intent') or {}))
        .replace('{{ risk }}', _json_block(payload.get('risk') or {}))
        .replace('{{ creative_brief }}', _json_block(payload.get('creative_brief') or {}))
        .replace('{{ visual_metaphor_catalog }}', str(payload.get('visual_metaphor_catalog') or ''))
    )
    return _append_teacher_visual_quality_supplement(filled)


def build_repair_mode_prompt(mode: str, payload: dict) -> str:
    """Mode-spezifischer Repair-Prompt für RepairAgent.

    ``mode`` ∈ {'bug_fix','design_improve','visual_polish','touch_optimize','layout_fix',
    'performance_fix','factual_warning','security_fix','general_repair'}.
    Fallback: ``free_html_repair.md`` (klassischer Repair-Prompt).
    """
    safe_mode = (mode or '').strip().replace('..', '').replace('/', '').replace('\\', '')
    candidate = _board_format_dir() / f'repair_{safe_mode}.md'
    if not candidate.is_file():
        candidate = _board_format_dir() / 'free_html_repair.md'
    md = candidate.read_text(encoding='utf-8')
    errs = payload.get('validation_errors') or []
    if isinstance(errs, list) and errs:
        err_block = '\n'.join(f'{i + 1}. {str(e).strip()}' for i, e in enumerate(errs))
    elif errs:
        err_block = str(errs)
    else:
        err_block = '*(Keine Fehlerliste übermittelt — prüfe den Code dennoch auf Sandbox-Konformität.)*'
    ctx = str(payload.get('context_hint') or '').strip() or '*(Kein Zusatzkontext.)*'
    body = (
        md.replace('{{ mode }}', safe_mode or 'general_repair')
        .replace('{{ validation_errors }}', err_block)
        .replace('{{ repair_attempt }}', str(int(payload.get('repair_attempt') or 1)))
        .replace('{{ repair_attempt_max }}', str(int(payload.get('repair_attempt_max') or 1)))
        .replace('{{ context_hint }}', ctx)
        .replace('{{ html }}', _truncate_block(str(payload.get('html') or '')))
        .replace('{{ css }}', _truncate_block(str(payload.get('css') or '')))
        .replace('{{ javascript }}', _truncate_block(str(payload.get('javascript') or '')))
        .replace('{{ libraries_summary }}', str(payload.get('libraries_summary') or '— keine —'))
        .replace('{{ assets_summary }}', str(payload.get('assets_summary') or '— keine —'))
        .replace('{{ datasets_summary }}', str(payload.get('datasets_summary') or '— keine —'))
        .replace('{{ style_dna }}', _json_block(payload.get('style_dna') or {}))
        .replace('{{ touch_audit }}', _json_block(payload.get('touch_audit') or {}))
        .replace('{{ screenshot_quality }}', _json_block(payload.get('screenshot_quality') or {}))
    )
    didactic = _board_didactic_markdown_block(payload)
    return _REPAIR_CONTENT_PRESERVATION_PREAMBLE + didactic + _append_teacher_visual_quality_supplement(body)


def build_screenshot_judge_prompt(payload: dict) -> str:
    md = (_board_format_dir() / 'screenshot_judge.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ style_dna }}', _json_block(payload.get('style_dna') or {}))
        .replace('{{ layout_metrics }}', _json_block(payload.get('layout_metrics') or {}))
    )


def _asset_engine_dir():
    return _FORMATS_DIR / 'asset_engine'


def build_asset_intent_prompt(payload: dict) -> str:
    md = (_asset_engine_dir() / 'asset_intent.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ prompt }}', str(payload.get('prompt') or '*(Kein Freitext.)*'))
        .replace('{{ intent }}', _json_block(payload.get('intent') or {}))
        .replace('{{ creative_brief }}', str(payload.get('creative_brief') or '— —'))
        .replace('{{ style_dna_mood }}', str(payload.get('style_dna_mood') or '— —'))
        .replace('{{ heuristic }}', _json_block(payload.get('heuristic') or {}))
    )


def build_asset_planner_prompt(payload: dict) -> str:
    md = (_asset_engine_dir() / 'asset_planner.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ subject }}', str(payload.get('subject') or '— nicht angegeben —'))
        .replace('{{ grade }}', str(payload.get('grade') or '— nicht angegeben —'))
        .replace('{{ topic }}', str(payload.get('topic') or '— nicht angegeben —'))
        .replace('{{ prompt }}', str(payload.get('prompt') or '*(Kein Freitext.)*'))
        .replace('{{ intent }}', _json_block(payload.get('intent') or {}))
        .replace('{{ risk }}', _json_block(payload.get('risk') or {}))
        .replace('{{ creative_brief }}', _json_block(payload.get('creative_brief') or {}))
        .replace('{{ style_dna }}', _json_block(payload.get('style_dna') or {}))
        .replace('{{ asset_intent }}', _json_block(payload.get('asset_intent') or {}))
        .replace('{{ heuristic }}', _json_block(payload.get('heuristic') or {}))
        .replace('{{ style_families }}', _json_block(payload.get('style_families') or []))
        .replace('{{ available_procedural }}', _json_block(payload.get('available_procedural') or []))
    )


def build_asset_strategy_prompt(payload: dict) -> str:
    md = (_asset_engine_dir() / 'asset_strategy.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ asset }}', _json_block(payload.get('asset') or {}))
        .replace('{{ heuristic }}', _json_block(payload.get('heuristic') or {}))
    )


def build_svg_free_draw_prompt(payload: dict) -> str:
    md = (_asset_engine_dir() / 'svg_free_draw.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ asset_request }}', _json_block(payload.get('asset_request') or {}))
        .replace('{{ style_family }}', str(payload.get('style_family') or 'soft_cartoon'))
        .replace('{{ palette }}', _json_block(payload.get('palette') or {}))
        .replace('{{ design_tokens }}', _json_block(payload.get('design_tokens') or {}))
    )


def build_asset_repair_prompt(payload: dict) -> str:
    md = (_asset_engine_dir() / 'asset_repair.md').read_text(encoding='utf-8')
    errors = payload.get('validation_errors') or []
    warnings = payload.get('validation_warnings') or []
    err_block = '\n'.join(f'- {e}' for e in errors) if errors else '*(keine)*'
    warn_block = '\n'.join(f'- {w}' for w in warnings) if warnings else '*(keine)*'
    return (
        md.replace('{{ mode }}', str(payload.get('mode') or 'fix_validation'))
        .replace('{{ directive }}', str(payload.get('directive') or ''))
        .replace('{{ asset_request }}', _json_block(payload.get('asset_request') or {}))
        .replace('{{ style_family }}', str(payload.get('style_family') or 'soft_cartoon'))
        .replace('{{ palette }}', _json_block(payload.get('palette') or {}))
        .replace('{{ design_tokens }}', _json_block(payload.get('design_tokens') or {}))
        .replace('{{ critique }}', str(payload.get('critique') or ''))
        .replace('{{ validation_errors }}', err_block)
        .replace('{{ validation_warnings }}', warn_block)
        .replace('{{ svg }}', _truncate_block(str(payload.get('svg') or '')))
    )


def build_asset_quality_judge_prompt(payload: dict) -> str:
    md = (_asset_engine_dir() / 'asset_quality_judge.md').read_text(encoding='utf-8')
    return (
        md.replace('{{ asset_type }}', str(payload.get('asset_type') or 'other'))
        .replace('{{ background_mode }}', str(payload.get('background_mode') or 'transparent_cutout'))
        .replace('{{ style_family }}', str(payload.get('style_family') or ''))
        .replace('{{ svg }}', _truncate_block(str(payload.get('svg') or '')))
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
        .replace('{{DOCUMENT_OUTLINE}}', str(payload.get('document_outline') or '(keine Übersicht)'))
        .replace('{{OTHER_PAGES_SUMMARY}}', str(payload.get('other_pages_summary') or '(keine weiteren Seiten)'))
        .replace('{{CURRENT_PAGE_JSON}}', _json_block(payload.get('current_page') or {}))
        .replace('{{PAGE_SETUP_JSON}}', _json_block(payload.get('page_setup') or {}))
        .replace('{{PRESENTATION_JSON}}', _json_block(payload.get('presentation') or {}))
        .replace('{{TEACHER_INSTRUCTION}}', instr)
    )
    ref_path = _SHARED_DIR / 'latex_katex_schule_reference.md'
    if ref_path.is_file():
        base += '\n\n---\n\n' + ref_path.read_text(encoding='utf-8')
    return _append_teacher_visual_quality_supplement(base)
