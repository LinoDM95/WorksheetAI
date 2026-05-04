"""Eine einzelne Seite per KI neu aufbauen, Rest des content unverändert."""
from __future__ import annotations

import copy
from apps.ai.providers.factory import get_provider
from .validators import validate_and_repair
from .content_blocks import repair_incomplete_ai_blocks, apply_page_coalesce_to_content, apply_page_overflow_reflow
from .render_model import build_render_model


def _other_pages_summary(pages: list, skip_idx: int) -> str:
    lines = []
    for i, p in enumerate(pages):
        if i == skip_idx:
            continue
        blocks = p.get('blocks') or []
        titles = [str(b.get('title') or b.get('type') or '?') for b in blocks[:6]]
        lines.append(f'Seite {i + 1}: {len(blocks)} Blöcke — {", ".join(titles)}')
    return '\n'.join(lines) if lines else '(nur diese Seite im Dokument)'


def regenerate_worksheet_page(
    worksheet,
    page_index: int,
    teacher_instruction: str = '',
    content: dict | None = None,
):
    """
    :param content: aktueller Entwurf (z. B. vom Frontend); sonst worksheet.content
    :returns: (content_dict, render_model_dict, validation_notes)
    """
    src = copy.deepcopy(content) if content is not None else copy.deepcopy(worksheet.content)
    if not isinstance(src, dict):
        raise ValueError('Ungültiger Arbeitsblatt-Inhalt')
    pages = src.get('pages')
    if not isinstance(pages, list) or page_index < 0 or page_index >= len(pages):
        raise ValueError('Ungültige Seitennummer')
    old_page = pages[page_index]
    req_meta = {
        'theme': (worksheet.render_model or {}).get('theme', 'neutral'),
        'creativity': (worksheet.render_model or {}).get('creativity', 'balanced'),
    }
    payload = {
        'worksheet_meta': {
            'title': src.get('title'),
            'subtitle': src.get('subtitle'),
            'subject': worksheet.subject,
            'grade': worksheet.grade,
            'topic': worksheet.topic,
        },
        'page_index': page_index,
        'page_total': len(pages),
        'current_page': old_page,
        'other_pages_summary': _other_pages_summary(pages, page_index),
        'teacher_instruction': (teacher_instruction or '').strip()[:4000],
        'page_setup': worksheet.page_setup,
        'presentation': src.get('presentation'),
    }
    provider = get_provider()
    new_page = provider.regenerate_page(payload)
    blocks = new_page.get('blocks')
    if not isinstance(blocks, list) or len(blocks) == 0:
        raise ValueError('Die KI hat keine gültigen Blöcke für diese Seite geliefert')
    pages[page_index] = {
        'page_label': str(new_page.get('page_label') if new_page.get('page_label') is not None else old_page.get('page_label') or ''),
        'blocks': blocks,
    }
    src['pages'] = pages
    src, errors = validate_and_repair(src, worksheet.pattern)
    src, repair_notes = repair_incomplete_ai_blocks(src)
    src, coalesce_notes = apply_page_coalesce_to_content(src)
    src, reflow_notes = apply_page_overflow_reflow(src)
    notes = list(errors) + repair_notes + coalesce_notes + reflow_notes
    if notes:
        src['validation_errors'] = notes
    elif 'validation_errors' in src:
        del src['validation_errors']
    render_model = build_render_model(src, worksheet.page_setup, worksheet.pattern, req_meta)
    return src, render_model, notes
