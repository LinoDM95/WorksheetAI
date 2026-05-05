"""compose_board: Multi-Slide-Bundle, Bausteine im Output, dedupliziertes CSS, used_libraries."""
from __future__ import annotations

from django.test import SimpleTestCase

from apps.boards.services.blocks.compose import compose_board
from apps.boards.services.blocks.validators import validate_spec
from apps.boards.services.free_html_sanitize import (
    sanitize_free_html_bundle,
    validate_free_html_bundle,
)


def _spec_with_two_pages_and_chart() -> dict:
    return {
        'subject': 'Mathe',
        'grade': '5',
        'topic': 'Statistik',
        'title': 'Stundenklima',
        'description': 'Eine kurze Doppelstunde mit Visualisierung.',
        'theme_id': 'science',
        'pages': [
            {
                'title': 'Einstieg',
                'blocks': [
                    {
                        'block_id': 'textkarte',
                        'content': {
                            'title': 'Heute',
                            'body': 'Wir lernen Statistik in 2 Schritten.',
                            'merksatz': '',
                        },
                    },
                    {
                        'block_id': 'multiple_choice',
                        'content': {
                            'question': 'Was ist der Median?',
                            'options': [
                                {'text': 'Mittlerer Wert', 'correct': True},
                                {'text': 'Häufigster Wert', 'correct': False},
                            ],
                            'explanation': '',
                        },
                    },
                ],
            },
            {
                'title': 'Visualisierung',
                'blocks': [
                    {
                        'block_id': 'balken_chart',
                        'content': {
                            'title': 'Klassenumfrage',
                            'x_label': 'Antwort',
                            'y_label': 'Stimmen',
                            'entries': [
                                {'label': 'Ja', 'value': 12},
                                {'label': 'Nein', 'value': 7},
                                {'label': 'Vielleicht', 'value': 5},
                            ],
                        },
                    },
                ],
            },
        ],
    }


class ComposeBoardTests(SimpleTestCase):
    def setUp(self) -> None:
        self.spec = validate_spec(_spec_with_two_pages_and_chart())
        self.bundle = compose_board(self.spec)

    def test_bundle_is_complete(self) -> None:
        for key in ('html', 'css', 'javascript', 'used_libraries', 'title'):
            self.assertIn(key, self.bundle)

    def test_html_contains_each_slide_and_block(self) -> None:
        html = self.bundle['html']
        self.assertIn('data-bb-slide="0"', html)
        self.assertIn('data-bb-slide="1"', html)
        self.assertIn('Heute', html)
        self.assertIn('Median', html)
        self.assertIn('Klassenumfrage', html)

    def test_used_libraries_only_chartjs(self) -> None:
        # Keine d3 (kein Zahlenstrahl im Spec), aber chartjs
        self.assertIn('chartjs', self.bundle['used_libraries'])
        self.assertNotIn('d3', self.bundle['used_libraries'])

    def test_slide_controller_present_once(self) -> None:
        js = self.bundle['javascript']
        self.assertEqual(js.count('data-bb-stage-prev'), 1, js)

    def test_block_css_deduplicated(self) -> None:
        # textkarte erscheint nur einmal in den Spezifikations-Klassen,
        # auch wenn sie mehrfach instanziiert würde — wir testen mit dem Compose,
        # der Klassen-CSS pro Block-Typ nur einmal sammelt.
        css = self.bundle['css']
        self.assertEqual(css.count('.bb-textkarte__title'), 1)

    def test_pipeline_validation_passes(self) -> None:
        sanitized = sanitize_free_html_bundle({
            'html': self.bundle['html'],
            'css': self.bundle['css'],
            'javascript': self.bundle['javascript'],
            'used_libraries': self.bundle['used_libraries'],
            'used_assets': self.bundle['used_assets'],
            'used_datasets': self.bundle['used_datasets'],
        })
        ok, errs, _ = validate_free_html_bundle(sanitized)
        self.assertTrue(ok, errs)


class ComposeAllBlocksSmokeTest(SimpleTestCase):
    def test_each_block_renders_and_validates(self) -> None:
        from apps.boards.services.blocks.registry import BLOCKS

        # Pro Block einzeln auf eigener Seite, mit Default-Content.
        for definition in BLOCKS:
            with self.subTest(block=definition.id):
                spec = validate_spec({
                    'subject': '', 'grade': '', 'topic': definition.label,
                    'title': definition.label, 'description': '',
                    'theme_id': 'science',
                    'pages': [
                        {
                            'title': definition.label,
                            'blocks': [{'block_id': definition.id, 'content': definition.default_content}],
                        },
                    ],
                })
                bundle = compose_board(spec)
                sanitized = sanitize_free_html_bundle({
                    'html': bundle['html'], 'css': bundle['css'], 'javascript': bundle['javascript'],
                    'used_libraries': bundle['used_libraries'],
                    'used_assets': bundle['used_assets'],
                    'used_datasets': bundle['used_datasets'],
                })
                ok, errs, _ = validate_free_html_bundle(sanitized)
                self.assertTrue(ok, f'{definition.id}: {errs}')
