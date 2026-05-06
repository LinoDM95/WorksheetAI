from __future__ import annotations

from django.test import SimpleTestCase, override_settings

from apps.ai.prompt_loader import (
    build_free_html_generation_prompt,
    build_free_html_repair_prompt,
    build_free_html_revision_prompt,
    build_repair_mode_prompt,
    build_page_regeneration_prompt,
    build_worksheet_generation_prompt,
    build_worksheet_generation_prompt_for_gemini,
    build_worksheet_review_prompt,
)
from apps.ai.providers.factory import get_provider
from apps.ai.providers.mock import MockWorksheetProvider


@override_settings(
    AI_PROMPT_WORKSHEET_FORMAT='html_a4_worksheet',
    GEMINI_COMPACT_PROMPT_JSON=True,
)
class PromptLoaderWorksheetTests(SimpleTestCase):
    def test_generation_prompt_injects_json_placeholders(self) -> None:
        req = {'topic': 'Test', 'grade': 3}
        out = build_worksheet_generation_prompt(req, {'orientation': 'portrait'}, {'id': 'p1'})
        self.assertIn('Test', out)
        self.assertIn('A4', out)
        self.assertIn('"topic":"Test"', out.replace(' ', ''))

    def test_generation_prompt_empty_teacher_uses_placeholder(self) -> None:
        out = build_worksheet_generation_prompt({}, {}, {}, curriculum_context=None)
        self.assertIn('Kein zusätzlicher Freitext', out)

    def test_generation_prompt_curriculum_block_when_none(self) -> None:
        out = build_worksheet_generation_prompt({}, {}, {})
        self.assertIn('kein** aktiver Lehrplan-Kontext', out)

    @override_settings(GEMINI_PROMPT_SPLIT_SYSTEM_USER=True)
    def test_gemini_split_returns_system_and_user(self) -> None:
        sys_p, user_p = build_worksheet_generation_prompt_for_gemini({'a': 1}, {'orientation': 'portrait'}, {})
        self.assertIsNotNone(sys_p)
        self.assertIn('Kontext vom Lehrenden', user_p)
        self.assertNotIn(user_p, sys_p or '')

    @override_settings(GEMINI_PROMPT_SPLIT_SYSTEM_USER=False)
    def test_gemini_split_disabled_returns_mono(self) -> None:
        sys_p, user_p = build_worksheet_generation_prompt_for_gemini({}, {}, {})
        self.assertIsNone(sys_p)
        self.assertIn('Kontext vom Lehrenden', user_p)

    def test_review_prompt_contains_worksheet_json(self) -> None:
        content = {'title': 'X'}
        out = build_worksheet_review_prompt(content, {}, {}, {})
        self.assertIn('"title":"X"', out.replace(' ', ''))

    def test_page_regeneration_prompt_contains_meta(self) -> None:
        out = build_page_regeneration_prompt(
            {
                'page_index': 1,
                'page_total': 3,
                'current_page': {'blocks': []},
                'worksheet_meta': {'title': 'T'},
            },
        )
        self.assertIn('T', out)


class PromptLoaderBoardTests(SimpleTestCase):
    def test_free_html_generation_substitutes_fields(self) -> None:
        p = build_free_html_generation_prompt(
            {'subject': 'Mathe', 'grade': '4', 'topic': 'Brüche', 'prompt': 'Mach ein Poster'},
        )
        self.assertIn('Mathe', p)
        self.assertIn('Brüche', p)
        self.assertIn('Mach ein Poster', p)

    def test_free_html_revision_truncates_huge_html(self) -> None:
        huge = 'x' * 210_000
        p = build_free_html_revision_prompt({'html': huge, 'user_prompt': 'fix'})
        self.assertIn('gekürzt', p)
        self.assertLess(len(p), len(huge) + 5000)

    def test_repair_mode_prompt_includes_content_preservation(self) -> None:
        p = build_repair_mode_prompt(
            'simplify',
            {'html': '<div>x</div>', 'css': '', 'javascript': '', 'context_hint': 'nur Button größer'},
        )
        self.assertIn('Kein unkontrolliertes Kürzen', p)
        self.assertIn('nur Button größer', p)

    def test_free_html_repair_lists_errors(self) -> None:
        p = build_free_html_repair_prompt({'validation_errors': ['a', 'b'], 'repair_attempt': 2})
        self.assertIn('1.', p)
        self.assertIn('2.', p)
        self.assertIn('2', p)


@override_settings(AI_PROVIDER='mock')
class ProviderFactoryAndMockTests(SimpleTestCase):
    def test_factory_returns_mock(self) -> None:
        p = get_provider()
        self.assertIsInstance(p, MockWorksheetProvider)

    def test_mock_generate_addition_topic(self) -> None:
        pr = MockWorksheetProvider()
        out = pr.generate(
            {
                'request': {'topic': 'Addition bis 20', 'grade_value': 2},
                'curriculum_context': {'topic_area': 'Zahlen', 'subtopics': ['Plus']},
            },
        )
        self.assertIn('pages', out)
        self.assertIn('curriculum_alignment', out)
        self.assertEqual(out['curriculum_alignment']['used_topic_area'], 'Zahlen')

    def test_mock_generate_default_shape(self) -> None:
        pr = MockWorksheetProvider()
        out = pr.generate({'request': {'topic': 'Photosynthese'}})
        blocks = out['pages'][0]['blocks']
        self.assertTrue(any(b.get('type') == 'task_list' for b in blocks))

    def test_mock_regenerate_page_appends_block(self) -> None:
        pr = MockWorksheetProvider()
        page = {'page_label': 'Seite 1', 'blocks': [{'id': 'x', 'type': 'text', 'content': 'a'}]}
        out = pr.regenerate_page({'current_page': page})
        self.assertGreater(len(out['blocks']), len(page['blocks']))
        self.assertTrue(any(b.get('id') == 'mock-regen' for b in out['blocks']))

    def test_mock_review_returns_same_content(self) -> None:
        pr = MockWorksheetProvider()
        c = {'a': 1}
        self.assertIs(pr.review_worksheet(c, {}, {}, {}), c)
