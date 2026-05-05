from __future__ import annotations

from django.test import SimpleTestCase, TestCase

from apps.curricula.models import CurriculumContext
from apps.curricula.services.context_matching import (
    CurriculumContextMatchingService,
    _grade_in_band,
    _keyword_hits,
    _parse_grade_band,
)
from apps.curricula.services.schemas import CurriculumContextSchema, SourceRefSchema


class SourceRefSchemaTests(SimpleTestCase):
    def test_excerpt_trimmed_and_capped(self) -> None:
        long_e = 'ä' * 400
        r = SourceRefSchema(excerpt=long_e)
        self.assertLessEqual(len(r.excerpt), 300)


class CurriculumContextSchemaTests(SimpleTestCase):
    def test_normalized_errors_for_empty_required(self) -> None:
        s = CurriculumContextSchema(subject='', grade_band='', topic_area='')
        errs = s.normalized_errors()
        self.assertEqual(len(errs), 3)

    def test_clean_lists_drop_empty(self) -> None:
        s = CurriculumContextSchema(
            subject='Mathe',
            grade_band='3-4',
            topic_area='Zahlen',
            subtopics=['  a  ', '', None, 'b'],
        )
        self.assertEqual(s.subtopics, ['a', 'b'])

    def test_ensure_teacher_summary_builds_title(self) -> None:
        s = CurriculumContextSchema(
            subject='Mathe',
            grade_band='3-4',
            topic_area='Brüche',
            allowed_task_types=['Üben'],
            competency_goals=['K1'],
        )
        tf = s.ensure_teacher_summary()
        self.assertIn('Mathe', tf['title'])
        self.assertIn('Brüche', tf['title'])


class ContextMatchingHelpersTests(SimpleTestCase):
    def test_parse_grade_band_range_and_single(self) -> None:
        self.assertEqual(_parse_grade_band('3-4'), (3, 4))
        self.assertEqual(_parse_grade_band('3–4'), (3, 4))
        self.assertEqual(_parse_grade_band('5'), (5, 5))
        self.assertEqual(_parse_grade_band('klasse'), (None, None))

    def test_grade_in_band(self) -> None:
        self.assertTrue(_grade_in_band(3, '1-4'))
        self.assertFalse(_grade_in_band(9, '1-4'))
        self.assertTrue(_grade_in_band(None, 'any'))

    def test_keyword_hits_topic_in_area(self) -> None:
        ctx = CurriculumContext(topic_area='Zahlen und Operationen', subtopics=['Addition'])
        self.assertGreater(_keyword_hits('Addition Aufgaben', ctx), 0)


class ContextMatchingDbTests(TestCase):
    def test_find_best_contexts_orders_by_score(self) -> None:
        CurriculumContext.objects.create(
            state='Berlin',
            subject='Mathematik',
            grade_band='1-4',
            topic_area='Zahlen',
            subtopics=['Addition'],
            status=CurriculumContext.STATUS_ACTIVE,
        )
        CurriculumContext.objects.create(
            state='Bayern',
            subject='Mathematik',
            grade_band='1-4',
            topic_area='Geometrie',
            subtopics=[],
            status=CurriculumContext.STATUS_ACTIVE,
        )
        hits = CurriculumContextMatchingService.find_best_contexts(
            state='Berlin',
            subject='Mathematik',
            grade=2,
            topic='Addition',
            limit=2,
        )
        self.assertGreaterEqual(len(hits), 1)
        self.assertGreaterEqual(hits[0]['score'], hits[-1]['score'])

    def test_compact_context_includes_quality(self) -> None:
        ctx = CurriculumContext.objects.create(
            state='SL',
            subject='Deutsch',
            grade_band='5-6',
            topic_area='Lesen',
            subtopics=[],
            status=CurriculumContext.STATUS_DRAFT,
            quality_status=CurriculumContext.QUALITY_AI,
        )
        d = CurriculumContextMatchingService.compact_context_for_prompt(ctx)
        self.assertEqual(d['quality_status'], CurriculumContext.QUALITY_AI)
        self.assertEqual(d['subject'], 'Deutsch')

    def test_build_teacher_visible_usage_basic(self) -> None:
        ctx = CurriculumContext.objects.create(
            state='SL',
            subject='Mathe',
            grade_band='1-2',
            topic_area='Zahlen',
            subtopics=['1-10'],
            status=CurriculumContext.STATUS_ACTIVE,
            teacher_facing_summary={'title': 'Titel SL', 'short_description': 'Kurz'},
        )
        out = CurriculumContextMatchingService.build_teacher_visible_usage(
            ctx,
            match_score=4.5,
            match_reasons=['Test'],
        )
        self.assertEqual(out['title'], 'Titel SL')
        self.assertEqual(out['match_score'], 4.5)
        self.assertIn('Test', out['match_reasons'])
