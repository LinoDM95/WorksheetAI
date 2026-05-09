from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase, TestCase, override_settings

from apps.boards.owner import resolve_board_owner
from apps.worksheets.owner import LOCAL_DEV_USERNAME, resolve_worksheet_owner
from apps.worksheets.services.pipeline import WorksheetGenerator, WorksheetPipeline, _sanitize_curriculum_alignment
from apps.worksheets.services.page import normalize_page_setup


class SanitizeCurriculumAlignmentTests(TestCase):
    def test_empty_returns_empty_dict(self) -> None:
        self.assertEqual(_sanitize_curriculum_alignment(None), {})
        self.assertEqual(_sanitize_curriculum_alignment('x'), {})

    def test_truncates_and_stringifies_lists(self) -> None:
        raw = {
            'used_topic_area': '  Za  ',
            'used_subtopics': [' a ', None, 3, 'x' * 50],
            'used_competency_goals': [],
            'used_task_types': ['t1'],
            'used_language_guidance': ['g'],
            'notes': 'n' * 5000,
        }
        out = _sanitize_curriculum_alignment(raw)
        self.assertEqual(out['used_topic_area'], 'Za')
        self.assertEqual(out['used_subtopics'][0], 'a')
        self.assertEqual(len(out['notes']), 4000)


class NormalizePageSetupTests(TestCase):
    def test_default_orientation_portrait(self) -> None:
        n = normalize_page_setup({})
        self.assertEqual(n['orientation'], 'portrait')
        self.assertEqual(n['format'], 'A4')
        self.assertIn('content_line_budget', n)

    def test_landscape_wider_safe_area(self) -> None:
        n = normalize_page_setup({'orientation': 'landscape', 'margins_mm': {'left': 10, 'right': 10, 'top': 10, 'bottom': 10}})
        self.assertEqual(n['orientation'], 'landscape')
        self.assertGreater(n['safe_area']['width_mm'], 250)

    def test_line_budget_include_app_header_false(self) -> None:
        base = normalize_page_setup({})
        off = normalize_page_setup({'margins_mm': base['margins_mm'], 'line_budget_include_app_header': False})
        self.assertFalse(off['line_budget_include_app_header'])
        self.assertLess(
            float(base['content_line_budget']['usable_body_height_mm']),
            float(off['content_line_budget']['usable_body_height_mm']),
        )


class WorksheetPipelineRepairHookTests(TestCase):
    def test_attach_validation_errors_sets_list(self) -> None:
        c: dict = {}
        WorksheetPipeline.attach_validation_errors(c, ['e1'])
        self.assertEqual(c['validation_errors'], ['e1'])

    def test_attach_validation_errors_clears_when_empty(self) -> None:
        c: dict = {'validation_errors': ['old']}
        WorksheetPipeline.attach_validation_errors(c, [])
        self.assertNotIn('validation_errors', c)


class WorksheetInboxListingDefaultsTests(SimpleTestCase):
    def test_fills_subtitle_from_payload_when_missing(self) -> None:
        content: dict = {'title': 'T', 'pages': []}
        WorksheetGenerator.apply_inbox_listing_defaults(content, {'subject_name': ' Mathe '})
        self.assertEqual(content['subtitle'], 'Mathe')

    def test_skips_when_subtitle_present(self) -> None:
        content = {'subtitle': 'Bio', 'pages': []}
        WorksheetGenerator.apply_inbox_listing_defaults(content, {'subject_name': 'Mathe'})
        self.assertEqual(content['subtitle'], 'Bio')

    def test_noop_without_payload_subject(self) -> None:
        content: dict = {'title': 'T'}
        WorksheetGenerator.apply_inbox_listing_defaults(content, {})
        self.assertNotIn('subtitle', content)


@override_settings(API_REQUIRE_AUTH=False)
class ResolveWorksheetOwnerDevTests(TestCase):
    def test_anonymous_gets_dev_user(self) -> None:
        user = resolve_worksheet_owner(AnonymousUser())
        self.assertTrue(user.is_authenticated or user.username == LOCAL_DEV_USERNAME)
        self.assertEqual(user.username, LOCAL_DEV_USERNAME)

    @override_settings(API_REQUIRE_AUTH=True)
    def test_anonymous_raises_when_auth_required(self) -> None:
        with self.assertRaises(ValueError):
            resolve_worksheet_owner(AnonymousUser())

    def test_authenticated_passes_through(self) -> None:
        User = get_user_model()
        u = User.objects.create_user('real_user', password='x')
        self.assertEqual(resolve_worksheet_owner(u), u)


@override_settings(API_REQUIRE_AUTH=False)
class ResolveBoardOwnerDevTests(TestCase):
    def test_anonymous_gets_same_dev_stub(self) -> None:
        user = resolve_board_owner(AnonymousUser())
        self.assertEqual(user.username, LOCAL_DEV_USERNAME)
