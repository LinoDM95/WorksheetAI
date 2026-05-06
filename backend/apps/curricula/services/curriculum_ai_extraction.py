"""KI-Extraktion: Rahmenlehrplan-Auszug zu kompaktem CurriculumContext-JSON."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from django.conf import settings

from apps.curricula.models import CurriculumExtractionJob, CurriculumSource
from apps.curricula.services.schemas import CurriculumContextSchema

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / 'prompts' / 'curriculum_extraction.md'


def _extraction_provider_name() -> str:
    name = (getattr(settings, 'CURRICULUM_EXTRACTION_PROVIDER', None) or '').strip().lower()
    if name:
        return name
    return (getattr(settings, 'AI_PROVIDER', None) or 'gemini').strip().lower()


def _resolve_page_numbers(job: CurriculumExtractionJob) -> tuple[list[int], str | None]:
    if job.selected_pages:
        pages = sorted({int(p) for p in job.selected_pages if p is not None})
        return pages, None
    if job.page_start is not None and job.page_end is not None:
        if job.page_end < job.page_start:
            return [], 'page_end liegt vor page_start.'
        pages = list(range(int(job.page_start), int(job.page_end) + 1))
        return pages, None
    return [], 'Seitenbereich fehlt (selected_pages oder page_start/page_end).'


def _build_excerpt(source: CurriculumSource, pages: list[int]) -> dict[str, Any]:
    by_page = {int(e['page']): e for e in (source.extracted_pages or []) if isinstance(e, dict)}
    excerpt_pages: list[dict[str, Any]] = []
    for p in pages:
        row = by_page.get(p)
        if row:
            excerpt_pages.append(
                {
                    'page': p,
                    'text': row.get('text') or '',
                    'char_count': row.get('char_count') or 0,
                },
            )
        else:
            excerpt_pages.append({'page': p, 'text': '', 'char_count': 0})
    return {'pages': excerpt_pages}


def _combined_text(excerpt: dict[str, Any]) -> str:
    parts: list[str] = []
    for block in excerpt.get('pages') or []:
        if not isinstance(block, dict):
            continue
        pn = block.get('page')
        tx = (block.get('text') or '').strip()
        if tx:
            parts.append(f'--- Seite {pn} ---\n{tx}')
    return '\n\n'.join(parts)


def _load_prompt_template() -> str:
    if _PROMPT_PATH.is_file():
        return _PROMPT_PATH.read_text(encoding='utf-8')
    return ''


def _mock_extract(job: CurriculumExtractionJob, excerpt: dict[str, Any]) -> dict[str, Any]:
    pages = [p['page'] for p in excerpt.get('pages') or [] if isinstance(p, dict)]
    return {
        'state': job.state,
        'curriculum_version': None,
        'subject': job.subject,
        'grade_band': job.grade_band,
        'level_band': list(job.level_band or []),
        'topic_area': 'MOCK - nur technischer Test',
        'subtopics': [],
        'competency_goals': [],
        'knowledge_goals': [],
        'skills': [],
        'allowed_task_types': [],
        'recommended_worksheet_formats': [],
        'language_guidance': {},
        'media_guidance': [],
        'cross_curricular_links': [],
        'validation_rules': [],
        'difficulty_notes': [],
        'source_refs': [
            {
                'document': job.source.title if job.source_id else '',
                'page': pages[0] if pages else None,
                'note': 'MOCK',
                'excerpt': '',
            },
        ],
        'public_summary': 'MOCK-Daten: nicht für echte Arbeitsblätter verwenden.',
        'teacher_facing_summary': {
            'title': 'MOCK · Technischer Test',
            'short_description': 'Nur Pipeline-Test ohne gültigen Lehrplaninhalt.',
            'used_for': [],
            'competency_highlights': [],
            'source_label': '',
        },
    }


CURRICULUM_RESPONSE_SCHEMA: dict[str, Any] = {
    'type': 'OBJECT',
    'properties': {
        'state': {'type': 'STRING'},
        'curriculum_version': {'type': 'STRING'},
        'subject': {'type': 'STRING'},
        'grade_band': {'type': 'STRING'},
        'level_band': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'topic_area': {'type': 'STRING'},
        'subtopics': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'competency_goals': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'knowledge_goals': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'skills': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'allowed_task_types': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'recommended_worksheet_formats': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'language_guidance': {'type': 'OBJECT'},
        'media_guidance': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'cross_curricular_links': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'validation_rules': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'difficulty_notes': {'type': 'ARRAY', 'items': {'type': 'STRING'}},
        'source_refs': {'type': 'ARRAY', 'items': {'type': 'OBJECT'}},
        'public_summary': {'type': 'STRING'},
        'teacher_facing_summary': {'type': 'OBJECT'},
    },
}


def _gemini_extract_json(
    prompt: str,
    *,
    log_user=None,
    curriculum_job_id: str | None = None,
) -> dict[str, Any]:
    from google import genai
    from google.genai import types

    from apps.ai.gemini_model_fallback import generate_content_first_resolved_model
    from apps.boards.services.pipeline_ai_meter import log_standalone_gemini_usage

    api_key = getattr(settings, 'GEMINI_API_KEY', '') or ''
    if not api_key.strip():
        raise RuntimeError('GEMINI_API_KEY fehlt.')
    client = genai.Client(api_key=api_key)
    model = getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash')
    cfg = types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=min(getattr(settings, 'GEMINI_MAX_OUTPUT_TOKENS', 8192), 8192),
        response_mime_type='application/json',
        response_schema=CURRICULUM_RESPONSE_SCHEMA,
    )
    resp, resolved_model = generate_content_first_resolved_model(
        client,
        primary_model=model,
        contents=prompt,
        config=cfg,
    )
    extra = {'curriculum_job_id': curriculum_job_id} if curriculum_job_id else {}
    log_standalone_gemini_usage(
        resp=resp,
        model=resolved_model,
        step_type='curriculum_extraction',
        user=log_user,
        fallback_char_source=prompt,
        metadata_extra=extra,
    )
    text = resp.text or '{}'
    return json.loads(text)


class CurriculumAIExtractionService:
    @classmethod
    def extract_context(cls, job: CurriculumExtractionJob) -> dict[str, Any]:
        source = job.source
        if job.auto_run_id is not None:
            max_pages = max(
                int(getattr(settings, 'CURRICULUM_AUTO_MAX_PAGES_PER_SLICE', 12) or 12),
                int(getattr(settings, 'CURRICULUM_MAX_PAGES_PER_EXTRACTION', 8) or 8),
            )
        else:
            max_pages = int(getattr(settings, 'CURRICULUM_MAX_PAGES_PER_EXTRACTION', 8) or 8)

        job.status = CurriculumExtractionJob.STATUS_RUNNING
        job.validation_errors = []
        job.save(update_fields=['status', 'validation_errors', 'updated_at'])

        if source.extraction_status != CurriculumSource.EXTRACTION_DONE:
            job.status = CurriculumExtractionJob.STATUS_FAILED
            job.validation_errors = ['PDF-Text noch nicht extrahiert. Bitte zuerst Text extrahieren.']
            job.save(update_fields=['status', 'validation_errors', 'updated_at'])
            return {'ok': False, 'errors': job.validation_errors}

        pages, err = _resolve_page_numbers(job)
        if err:
            job.status = CurriculumExtractionJob.STATUS_FAILED
            job.validation_errors = [err]
            job.save(update_fields=['status', 'validation_errors', 'updated_at'])
            return {'ok': False, 'errors': job.validation_errors}

        if len(pages) > max_pages:
            job.status = CurriculumExtractionJob.STATUS_FAILED
            job.validation_errors = [f'Maximal {max_pages} Seiten pro Extraktion erlaubt.']
            job.save(update_fields=['status', 'validation_errors', 'updated_at'])
            return {'ok': False, 'errors': job.validation_errors}

        excerpt = _build_excerpt(source, pages)
        if getattr(settings, 'CURRICULUM_STORE_SOURCE_EXCERPTS', True):
            job.source_excerpt = excerpt
        else:
            job.source_excerpt = {'pages': [{'page': p, 'char_count': 0} for p in pages]}
        job.selected_pages = pages

        extracted_text = _combined_text(excerpt)
        pages_label = ','.join(str(p) for p in pages)
        tmpl = _load_prompt_template()
        if not tmpl.strip():
            tmpl = '{{BODY}}'
        prompt = tmpl.replace('{{ state }}', job.state)
        prompt = prompt.replace('{{ subject }}', job.subject)
        prompt = prompt.replace('{{ grade_band }}', job.grade_band)
        prompt = prompt.replace('{{ level_band }}', json.dumps(job.level_band or [], ensure_ascii=False))
        prompt = prompt.replace('{{ topic_hint }}', job.topic_hint or '')
        prompt = prompt.replace('{{ source.title }}', source.title)
        prompt = prompt.replace('{{ pages }}', pages_label)
        prompt = prompt.replace('{{ extracted_text }}', extracted_text[:120000])
        job.prompt_text = prompt[:50000]
        job.save(update_fields=['source_excerpt', 'selected_pages', 'prompt_text', 'updated_at'])

        provider = _extraction_provider_name()
        try:
            if provider == 'mock':
                raw_out = _mock_extract(job, excerpt)
            else:
                raw_out = _gemini_extract_json(
                    prompt,
                    log_user=job.created_by,
                    curriculum_job_id=str(job.pk),
                )
            job.ai_raw_output = raw_out if isinstance(raw_out, dict) else {'raw': raw_out}
        except Exception as exc:
            logger.exception('Curriculum AI extraction failed')
            job.status = CurriculumExtractionJob.STATUS_FAILED
            job.extraction_summary = ''
            job.validation_errors = [str(exc)[:2000]]
            job.save(
                update_fields=[
                    'ai_raw_output',
                    'status',
                    'extraction_summary',
                    'validation_errors',
                    'updated_at',
                ],
            )
            return {'ok': False, 'errors': job.validation_errors}

        try:
            model = CurriculumContextSchema.model_validate(raw_out)
        except Exception as exc:
            job.status = CurriculumExtractionJob.STATUS_FAILED
            job.validation_errors = [f'JSON-Validierung: {exc}']
            job.extracted_context = {}
            job.save(
                update_fields=['status', 'validation_errors', 'extracted_context', 'ai_raw_output', 'updated_at'],
            )
            return {'ok': False, 'errors': job.validation_errors}

        val_errs = model.normalized_errors()
        if val_errs:
            job.status = CurriculumExtractionJob.STATUS_FAILED
            job.validation_errors = val_errs
            job.extracted_context = model.model_dump(exclude_none=True)
            job.save(
                update_fields=[
                    'status',
                    'validation_errors',
                    'extracted_context',
                    'ai_raw_output',
                    'updated_at',
                ],
            )
            return {'ok': False, 'errors': val_errs}

        ctx_dict = model.to_context_dict(document_title=source.title)
        job.extracted_context = ctx_dict
        job.validation_errors = []
        job.extraction_summary = (
            f'Extrahiert: Themenfeld „{model.topic_area}“, '
            f'{len(model.subtopics)} Unterthemen, {len(model.competency_goals)} Kompetenzen, '
            f'{len(model.allowed_task_types)} Aufgabenformate ({job.subject}, Klassenband {job.grade_band}).'
        )
        job.status = CurriculumExtractionJob.STATUS_COMPLETED
        job.review_status = CurriculumExtractionJob.REVIEW_NEEDS
        job.save(
            update_fields=[
                'extracted_context',
                'validation_errors',
                'extraction_summary',
                'status',
                'review_status',
                'ai_raw_output',
                'updated_at',
            ],
        )
        return {'ok': True, 'context': ctx_dict}
