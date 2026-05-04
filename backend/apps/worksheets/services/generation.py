import logging

from django.conf import settings

from apps.ai.providers.factory import get_provider
from apps.patterns.models import WorksheetPattern
from apps.patterns.services import PatternMatcher
from apps.worksheets.models import Worksheet
from apps.worksheets.owner import resolve_worksheet_owner

from .content_blocks import (
    apply_page_coalesce_to_content,
    apply_page_overflow_reflow,
    repair_incomplete_ai_blocks,
)
from .page import normalize_page_setup
from .render_model import build_render_model
from .validators import validate_and_repair

logger = logging.getLogger(__name__)


def _review_output_or_original(original: dict, reviewed: object) -> dict:
    """Pflichtfelder prüfen; Seiten nur nach oben wachsen lassen (kein Löschen im Review)."""
    if not isinstance(reviewed, dict):
        logger.warning('Review verworfen: Antwort ist kein Objekt.')
        return original
    need = ('title', 'pages', 'presentation', 'solutions')
    for key in need:
        if key not in reviewed:
            logger.warning('Review verworfen: Pflichtfeld %s fehlt.', key)
            return original
    o_pages = original.get('pages')
    r_pages = reviewed.get('pages')
    if not isinstance(o_pages, list) or not isinstance(r_pages, list):
        logger.warning('Review verworfen: pages nicht als Liste.')
        return original
    if len(r_pages) < 1:
        logger.warning('Review verworfen: pages leer.')
        return original
    if len(r_pages) < len(o_pages):
        logger.warning(
            'Review verworfen: weniger Seiten als im Erstentwurf (%s → %s) — keine Löschung erlaubt.',
            len(o_pages),
            len(r_pages),
        )
        return original
    max_extra = getattr(settings, 'GEMINI_REVIEW_MAX_EXTRA_PAGES', 10)
    if len(r_pages) - len(o_pages) > max_extra:
        logger.warning(
            'Review verworfen: zu viele Zusatzseiten (%s über Basis), max %s.',
            len(r_pages) - len(o_pages),
            max_extra,
        )
        return original
    if len(r_pages) != len(o_pages):
        logger.info(
            'Review: Seitenanzahl %s → %s (Anfügen am Ende laut Prompt erlaubt).',
            len(o_pages),
            len(r_pages),
        )
    return reviewed


def generate_worksheet(user, payload):
    user = resolve_worksheet_owner(user)
    pattern=None
    if payload.get('pattern_id'):
        pattern=WorksheetPattern.objects.get(id=payload['pattern_id'])
    elif payload.get('use_pattern_matching', True):
        matches=PatternMatcher().find_best(WorksheetPattern.objects.filter(status='active'), payload, 1)
        if matches: pattern=matches[0]['pattern']
    page_setup=normalize_page_setup(payload.get('page_setup') or {})
    provider=get_provider()
    ai_payload={'request': payload, 'page_setup': page_setup, 'pattern': pattern.blueprint if pattern else {}}
    content=provider.generate(ai_payload)
    if getattr(settings, 'GEMINI_ENABLE_REVIEW_PASS', False):
        try:
            review = getattr(provider, 'review_worksheet', None)
            if callable(review):
                reviewed = review(
                    content,
                    payload,
                    page_setup,
                    pattern.blueprint if pattern else {},
                )
                content = _review_output_or_original(content, reviewed)
        except Exception as exc:
            logger.warning(
                'Review-Durchgang fehlgeschlagen, es wird der Erstentwurf verwendet: %s',
                exc,
                exc_info=True,
            )
    content, errors=validate_and_repair(content, pattern)
    content, repair_notes=repair_incomplete_ai_blocks(content)
    content, coalesce_notes=apply_page_coalesce_to_content(content)
    content, reflow_notes=apply_page_overflow_reflow(content)
    errors=list(errors)+repair_notes+coalesce_notes+reflow_notes
    render_model=build_render_model(content, page_setup, pattern, payload)
    ws=Worksheet.objects.create(owner=user, pattern=pattern, title=content.get('title','Arbeitsblatt'), subject=payload.get('subject_name') or payload.get('subject',''), grade=payload.get('grade_value') or payload.get('grade'), topic=payload.get('topic',''), page_setup=page_setup, content=content, render_model=render_model)
    if errors: ws.content['validation_errors']=errors; ws.save(update_fields=['content'])
    return ws
