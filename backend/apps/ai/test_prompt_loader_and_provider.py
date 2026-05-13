from __future__ import annotations

from django.test import SimpleTestCase, override_settings

from apps.ai.prompt_loader import (
    build_free_html_generation_prompt,
    build_free_html_repair_prompt,
    build_free_html_revision_prompt,
    build_repair_mode_prompt,
    build_page_regeneration_prompt,
    build_worksheet_creative_html_generation_prompt,
    build_worksheet_creative_html_page_regeneration_prompt,
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

    def test_generation_prompt_standard_has_no_creative_html_rubric(self) -> None:
        req = {'topic': 'X', 'grade': 3}
        out_std = build_worksheet_generation_prompt(req, {'orientation': 'portrait'}, {})
        self.assertNotIn('html-a4-creative', out_std)
        self.assertNotIn('ws-creative-page-inner', out_std)

    def test_creative_html_generation_prompt_is_separate(self) -> None:
        req = {'topic': 'X', 'grade': 3, 'worksheet_mode': 'creative'}
        out = build_worksheet_creative_html_generation_prompt(req, {'orientation': 'portrait'}, {})
        self.assertIn('X', out)
        self.assertIn('ws-creative-page-inner', out)

    def test_creative_html_page_regenerate_prompt_mentions_json_fields(self) -> None:
        out = build_worksheet_creative_html_page_regeneration_prompt(
            {
                'page_index': 0,
                'page_total': 2,
                'current_page': {'html': '<div class="ws-creative-page-inner"></div>', 'page_css': ''},
                'worksheet_meta': {'title': 'T'},
                'other_pages_summary': '',
                'other_pages_style_reference': 'STYLE_REF_UNIQUE',
                'teacher_instruction': '',
            },
        )
        self.assertIn('html', out.lower())
        self.assertIn('STYLE_REF_UNIQUE', out)
        self.assertNotIn('{{OTHER_PAGES_STYLE_REFERENCE}}', out)

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
        self.assertIn('Geltungsbereich', p)
        self.assertIn('Phaser 3.80', p)

    def test_free_html_revision_truncates_huge_html(self) -> None:
        huge = 'x' * 210_000
        p = build_free_html_revision_prompt({'html': huge, 'user_prompt': 'fix'})
        self.assertIn('gekürzt', p)
        # Fester Prompt-Rumpf inkl. eingebetteter Lehrer-Regeln (z. B. Phaser-Block);
        # Obergrenze relativ zur gekürzten HTML-Einbettung, nicht absolut klein.
        self.assertLess(len(p), len(huge) + 25_000)

    def test_free_html_revision_substitutes_didactic_fields(self) -> None:
        p = build_free_html_revision_prompt(
            {
                'html': '<div>x</div>',
                'css': '',
                'javascript': '',
                'user_prompt': 'mehr Kontrast',
                'board_subject': 'Mathe',
                'board_grade': '5',
                'board_topic': 'Brüche',
                'board_generation_prompt': 'Interaktive Übung zu Äquivalenz',
            },
        )
        self.assertIn('Mathe', p)
        self.assertIn('Brüche', p)
        self.assertIn('Äquivalenz', p)
        self.assertIn('mehr Kontrast', p)

    def test_repair_mode_prompt_includes_content_preservation(self) -> None:
        p = build_repair_mode_prompt(
            'simplify',
            {'html': '<div>x</div>', 'css': '', 'javascript': '', 'context_hint': 'nur Button größer'},
        )
        self.assertIn('Kein unkontrolliertes Kürzen', p)
        self.assertIn('nur Button größer', p)

    def test_repair_mode_prompt_includes_didactic_block_when_set(self) -> None:
        p = build_repair_mode_prompt(
            'bug_fix',
            {
                'html': '<div>a</div>',
                'css': '',
                'javascript': '',
                'context_hint': 'fix',
                'board_subject': 'Bio',
                'board_topic': 'Zelle',
                'board_generation_prompt': 'Organelle benennen',
            },
        )
        self.assertIn('Ursprünglicher didaktischer Kontext', p)
        self.assertIn('Bio', p)
        self.assertIn('Organelle', p)

    def test_repair_mode_script_fix_prompt_loads(self) -> None:
        p = build_repair_mode_prompt(
            'script_fix',
            {
                'html': '<div id="board-root"></div>',
                'css': '',
                'javascript': 'confetti();',
                'validation_errors': ['[Skript] confetti ohne Lib'],
                'repair_attempt': 1,
                'repair_attempt_max': 1,
                'context_hint': 'test',
            },
        )
        self.assertIn('script_fix', p.lower())
        self.assertIn('used_libraries', p.lower())

    def test_free_html_repair_lists_errors(self) -> None:
        p = build_free_html_repair_prompt({'validation_errors': ['a', 'b'], 'repair_attempt': 2})
        self.assertIn('1.', p)
        self.assertIn('2.', p)
        self.assertIn('2', p)

    def test_free_html_repair_prepends_didactic_when_set(self) -> None:
        p = build_free_html_repair_prompt(
            {
                'validation_errors': ['x'],
                'repair_attempt': 1,
                'board_subject': 'Chemie',
                'board_generation_prompt': 'Säuren und Basen',
            },
        )
        self.assertIn('Ursprünglicher didaktischer Kontext', p)
        self.assertIn('Chemie', p)


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

    def test_mock_generate_creative_returns_html_pages(self) -> None:
        pr = MockWorksheetProvider()
        out = pr.generate({'request': {'topic': 'Kreativ', 'grade_value': 4, 'worksheet_mode': 'creative'}})
        self.assertIn('pages', out)
        self.assertIn('html', out['pages'][0])
        self.assertNotIn('blocks', out['pages'][0])

    def test_mock_regenerate_page_creative_returns_html(self) -> None:
        from apps.worksheets.services.creative_html_pipeline import RENDER_KIND_CREATIVE_HTML

        pr = MockWorksheetProvider()
        page = {
            'page_label': 'S1',
            'html': '<div class="ws-creative-page-inner"><p>Alt</p></div>',
            'page_css': '.ws-creative-page-inner p { margin: 0; }',
        }
        out = pr.regenerate_page(
            {'current_page': page, 'worksheet_render_kind': RENDER_KIND_CREATIVE_HTML},
        )
        self.assertIn('html', out)
        self.assertNotIn('blocks', out)
        self.assertIn('mock-regen', out['html'])

    def test_mock_review_returns_same_content(self) -> None:
        pr = MockWorksheetProvider()
        c = {'a': 1}
        self.assertIs(pr.review_worksheet(c, {}, {}, {}), c)
