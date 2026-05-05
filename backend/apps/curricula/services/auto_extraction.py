"""Auto-Extraktion: pro Discovery-Plan-Eintrag ein CurriculumExtractionJob,
KI-Aufruf via bestehendem CurriculumAIExtractionService, Fail-Soft."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from django.conf import settings

from apps.curricula.models import CurriculumExtractionJob, CurriculumSource
from apps.curricula.services.curriculum_ai_extraction import CurriculumAIExtractionService

logger = logging.getLogger(__name__)


def _retry_limit() -> int:
    return int(getattr(settings, 'CURRICULUM_AUTO_RETRY_LIMIT', 2) or 2)


def _ensure_plan_entry(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    subject = (entry.get('subject') or '').strip()
    topic = (entry.get('topic_area') or '').strip()
    grade = (entry.get('grade_band') or '').strip()
    if not subject or not topic or not grade:
        return None
    try:
        ps = int(entry.get('page_start'))
        pe = int(entry.get('page_end'))
    except (TypeError, ValueError):
        return None
    if pe < ps:
        return None
    level = entry.get('level_band') or []
    if not isinstance(level, list):
        level = []
    return {
        'subject': subject,
        'topic_area': topic,
        'grade_band': grade,
        'level_band': [str(x).strip() for x in level if isinstance(x, (str, int))],
        'page_start': ps,
        'page_end': pe,
    }


class CurriculumAutoExtractionService:
    """Iteriert über den Discovery-Plan einer Source und extrahiert pro Eintrag."""

    @classmethod
    def run(
        cls,
        source: CurriculumSource,
        *,
        selected_indices: list[int] | None = None,
        run_id: uuid.UUID | None = None,
        user=None,
    ) -> dict[str, Any]:
        plan = list(source.discovery_plan or [])
        if not plan:
            return {'ok': False, 'error': 'Kein Discovery-Plan vorhanden.', 'jobs': []}

        if selected_indices:
            indices = [i for i in selected_indices if 0 <= i < len(plan)]
        else:
            indices = list(range(len(plan)))
        if not indices:
            return {'ok': False, 'error': 'Keine gültigen Plan-Einträge ausgewählt.', 'jobs': []}

        if run_id is None:
            run_id = uuid.uuid4()
        source.auto_run_id = run_id
        source.save(update_fields=['auto_run_id', 'updated_at'])

        succeeded = 0
        failed = 0
        jobs_out: list[dict[str, Any]] = []

        for idx in indices:
            entry = _ensure_plan_entry(plan[idx])
            if not entry:
                failed += 1
                jobs_out.append(
                    {
                        'plan_index': idx,
                        'status': 'failed',
                        'error': 'Plan-Eintrag ungültig oder unvollständig.',
                        'job_id': None,
                    },
                )
                continue

            job = CurriculumExtractionJob.objects.filter(
                source=source,
                auto_run_id=run_id,
                plan_index=idx,
            ).first()
            if job is None:
                job = CurriculumExtractionJob(
                    source=source,
                    auto_run_id=run_id,
                    plan_index=idx,
                )
            job.state = source.state
            job.subject = entry['subject']
            job.grade_band = entry['grade_band']
            job.level_band = entry['level_band']
            job.topic_hint = entry['topic_area']
            job.page_start = entry['page_start']
            job.page_end = entry['page_end']
            job.selected_pages = []
            job.status = CurriculumExtractionJob.STATUS_PENDING
            job.validation_errors = []
            job.extracted_context = {}
            job.ai_raw_output = {}
            job.extraction_summary = ''
            if user is not None and getattr(user, 'is_authenticated', False) and not job.created_by_id:
                job.created_by = user
            job.save()

            attempts = 0
            ok = False
            last_err: str | None = None
            while attempts <= _retry_limit():
                attempts += 1
                try:
                    result = CurriculumAIExtractionService.extract_context(job)
                    if result.get('ok'):
                        ok = True
                        break
                    last_err = '; '.join(result.get('errors') or []) or 'Unbekannter Fehler.'
                except Exception as exc:
                    logger.exception('Auto-Extraction error on plan_index=%s', idx)
                    last_err = str(exc)[:1000]

            jobs_out.append(
                {
                    'plan_index': idx,
                    'status': 'completed' if ok else 'failed',
                    'error': None if ok else last_err,
                    'job_id': str(job.id),
                    'subject': entry['subject'],
                    'grade_band': entry['grade_band'],
                    'topic_area': entry['topic_area'],
                },
            )
            if ok:
                succeeded += 1
            else:
                failed += 1

        return {
            'ok': True,
            'run_id': str(run_id),
            'succeeded': succeeded,
            'failed': failed,
            'jobs': jobs_out,
        }
