"""End-to-end-Smoke fuer den Bausteinmodus-Service: Plan -> KI-Filling -> Compose."""
from __future__ import annotations

from django.test import TestCase, override_settings

from apps.boards.models import Board
from apps.boards.services.free_html_block_generation import FreeHtmlBlockBoardGenerationService


SAMPLE_PLAN = {
    'subject': 'Mathe',
    'grade': '5',
    'topic': 'Statistik',
    'title': 'Statistik in der Klasse',
    'style_hint': 'kurz, kindgerecht',
    'theme_id': 'science',
    'pages': [
        {
            'title': 'Einstieg',
            'bullets': [
                'Was bedeutet Median?',
                'Sortieren und Mitte finden',
                'Beispiel an der Klasse',
            ],
            'block_slots': [
                {'instance_id': 'a', 'block_id': 'textkarte', 'hint': ''},
                {'instance_id': 'b', 'block_id': 'multiple_choice', 'hint': 'symmetrisch vs. schief'},
            ],
        },
        {
            'title': 'Visualisierung',
            'bullets': ['Klassenumfrage Lieblingsfach', 'Mathe 8, Deutsch 4, Sport 12'],
            'block_slots': [
                {'instance_id': 'c', 'block_id': 'balken_chart', 'hint': ''},
            ],
        },
    ],
}


@override_settings(
    API_REQUIRE_AUTH=False,
    BOARDS_VISUAL_QA_ALLOWED=False,
    BOARDS_BLOCKS_FINISHING_ENABLED=False,
    AI_PROVIDER='mock',
)
class BlockGenerationServiceTests(TestCase):
    def test_creates_generated_board_from_plan(self) -> None:
        board = FreeHtmlBlockBoardGenerationService(None, SAMPLE_PLAN).run()
        self.assertIsInstance(board, Board)
        self.assertEqual(board.status, 'generated')
        self.assertIn('chartjs', board.used_libraries)
        self.assertEqual(board.subject, 'Mathe')
        self.assertEqual(board.grade, '5')
        self.assertEqual(board.title, 'Statistik in der Klasse')
        self.assertEqual(board.generation_input.get('composition_mode'), 'blocks')
        self.assertEqual(board.generation_input.get('theme_id'), 'science')
        self.assertEqual(
            len(board.generation_input.get('composition_plan', {}).get('pages', [])),
            2,
        )
        self.assertEqual(
            len(board.generation_input.get('composition_spec', {}).get('pages', [])),
            2,
        )
        self.assertIn('data-bb-slide="0"', board.html)

    def test_invalid_plan_raises_value_error(self) -> None:
        bad = dict(SAMPLE_PLAN)
        bad['pages'] = []
        with self.assertRaises(ValueError):
            FreeHtmlBlockBoardGenerationService(None, bad).run()

    def test_unknown_block_in_plan_raises(self) -> None:
        bad = {
            **SAMPLE_PLAN,
            'pages': [
                {
                    'title': 'X',
                    'bullets': ['Bullet'],
                    'block_slots': [{'instance_id': 'a', 'block_id': 'no-such-block', 'hint': ''}],
                },
            ],
        }
        with self.assertRaises(ValueError):
            FreeHtmlBlockBoardGenerationService(None, bad).run()
