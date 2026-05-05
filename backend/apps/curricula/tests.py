"""Smoke-Tests für Auto-Discovery, Auto-Extraktion und Approve-mit-Replikation.

Aufruf:

    python manage.py test apps.curricula
"""
from __future__ import annotations

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings

from apps.curricula.models import (
    CurriculumContext,
    CurriculumExtractionJob,
    CurriculumSource,
)
from apps.curricula.services.auto_discovery import CurriculumAutoDiscoveryService
from apps.curricula.services.auto_extraction import CurriculumAutoExtractionService
from apps.curricula.services.context_approval import CurriculumContextApprovalService


def _make_source(state: str = 'Berlin/Brandenburg', pages: int = 6, replicate=None) -> CurriculumSource:
    src = CurriculumSource.objects.create(
        title=f'{state} · Test',
        state=state,
        document_type=CurriculumSource.DOCUMENT_RLP_KOMPAKT,
        extraction_status=CurriculumSource.EXTRACTION_DONE,
        page_count=pages,
        extracted_pages=[
            {
                'page': i,
                'text': f'Seite {i} – Mathematik Inhalt Zahlen und Operationen ' * 4,
                'char_count': 200,
                'preview_text': f'Seite {i} Vorschau',
                'has_text': True,
            }
            for i in range(1, pages + 1)
        ],
        replicate_states=replicate or [],
    )
    src.file.save('test.pdf', ContentFile(b'%PDF-1.4 dummy'), save=True)
    return src


@override_settings(
    AI_PROVIDER='mock',
    CURRICULUM_EXTRACTION_PROVIDER='mock',
    CURRICULUM_AUTO_DISCOVERY_PROVIDER='mock',
    CURRICULUM_REQUIRE_HUMAN_REVIEW=False,
)
class AutoDiscoveryTests(TestCase):
    def test_discovery_creates_plan(self) -> None:
        src = _make_source()
        result = CurriculumAutoDiscoveryService.run(src)
        self.assertTrue(result['ok'])
        src.refresh_from_db()
        self.assertEqual(src.discovery_status, CurriculumSource.DISCOVERY_DONE)
        self.assertGreaterEqual(len(src.discovery_plan), 1)
        first = src.discovery_plan[0]
        self.assertIn('subject', first)
        self.assertIn('page_start', first)
        self.assertIn('page_end', first)


@override_settings(
    AI_PROVIDER='mock',
    CURRICULUM_EXTRACTION_PROVIDER='mock',
    CURRICULUM_AUTO_DISCOVERY_PROVIDER='mock',
    CURRICULUM_REQUIRE_HUMAN_REVIEW=False,
)
class AutoExtractionTests(TestCase):
    def test_extraction_runs_per_plan_entry(self) -> None:
        src = _make_source()
        CurriculumAutoDiscoveryService.run(src)
        src.refresh_from_db()
        result = CurriculumAutoExtractionService.run(src)
        self.assertTrue(result['ok'])
        self.assertGreaterEqual(result['succeeded'], 1)
        self.assertEqual(
            CurriculumExtractionJob.objects.filter(source=src).count(),
            len(src.discovery_plan),
        )


@override_settings(
    AI_PROVIDER='mock',
    CURRICULUM_EXTRACTION_PROVIDER='mock',
    CURRICULUM_AUTO_DISCOVERY_PROVIDER='mock',
    CURRICULUM_REQUIRE_HUMAN_REVIEW=False,
)
class ApproveRunReplicationTests(TestCase):
    def test_replication_creates_double_contexts(self) -> None:
        src = _make_source(replicate=['Berlin', 'Brandenburg'])
        CurriculumAutoDiscoveryService.run(src)
        src.refresh_from_db()
        run_result = CurriculumAutoExtractionService.run(src)
        self.assertTrue(run_result['ok'])

        for job in CurriculumExtractionJob.objects.filter(source=src):
            ctx = dict(job.extracted_context or {})
            ctx['subject'] = 'Mathematik'
            ctx['grade_band'] = '1-2'
            ctx['topic_area'] = 'Zahlen und Operationen'
            job.extracted_context = ctx
            job.save(update_fields=['extracted_context'])

        approve = CurriculumContextApprovalService.approve_run(
            src,
            src.auto_run_id,
            activate=True,
            replicate_states=['Berlin', 'Brandenburg'],
            reviewer=None,
        )
        self.assertTrue(approve['ok'])
        succeeded = CurriculumExtractionJob.objects.filter(
            source=src,
            status=CurriculumExtractionJob.STATUS_COMPLETED,
        ).count() + CurriculumExtractionJob.objects.filter(
            source=src,
            status=CurriculumExtractionJob.STATUS_APPROVED,
        ).count()
        self.assertGreater(succeeded, 0)
        self.assertEqual(len(approve['created']), 2 * len(approve['skipped']) + len(approve['created']))

        contexts = CurriculumContext.objects.filter(source=src)
        states = sorted({c.state for c in contexts})
        self.assertEqual(states, ['Berlin', 'Brandenburg'])

    def test_mock_topic_area_not_activated(self) -> None:
        src = _make_source()
        CurriculumAutoDiscoveryService.run(src)
        src.refresh_from_db()
        CurriculumAutoExtractionService.run(src)
        approve = CurriculumContextApprovalService.approve_run(
            src,
            src.auto_run_id,
            activate=True,
            replicate_states=None,
            reviewer=None,
        )
        self.assertEqual(len(approve['created']), 0)
        self.assertGreater(len(approve['skipped']), 0)
