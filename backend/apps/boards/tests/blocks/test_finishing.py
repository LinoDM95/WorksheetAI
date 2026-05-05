"""Bausteinmodus-Feinschliff: lehnt Code-Schlüssel strikt ab, hält sich an Theme-Whitelist."""
from __future__ import annotations

from django.test import SimpleTestCase

from apps.boards.services.blocks_finishing import _validate_finishing_payload


class FinishingValidatorTests(SimpleTestCase):
    def test_strips_forbidden_code_keys(self) -> None:
        result = _validate_finishing_payload(
            {
                'theme_id': 'science',
                'html': '<script>alert(1)</script>',
                'css': 'body{}',
                'javascript': 'fetch("/")',
                'teacher_notes': 'Hinweis',
            },
            default_theme_id='science',
        )
        self.assertEqual(result['theme_id'], 'science')
        self.assertNotIn('html', result)
        self.assertNotIn('css', result)
        self.assertNotIn('javascript', result)
        self.assertEqual(result['teacher_notes'], 'Hinweis')

    def test_unknown_theme_falls_back(self) -> None:
        result = _validate_finishing_payload({'theme_id': 'darkmode-pro'}, default_theme_id='science')
        self.assertEqual(result['theme_id'], 'science')

    def test_strips_html_from_text_fields(self) -> None:
        result = _validate_finishing_payload(
            {
                'theme_id': 'science',
                'teacher_notes': '<b>Wichtig</b>: <i>kein HTML</i>',
                'usage_instructions': ['<script>x</script>Schritt 1', '   '],
            },
            default_theme_id='science',
        )
        self.assertNotIn('<', result['teacher_notes'])
        self.assertNotIn('<', result['usage_instructions'][0])
        self.assertEqual(len(result['usage_instructions']), 1)

    def test_caps_lengths(self) -> None:
        result = _validate_finishing_payload(
            {
                'theme_id': 'science',
                'teacher_notes': 'a' * 5000,
                'usage_instructions': ['x' * 1000] * 20,
                'transitions': {'0': 'b' * 200},
            },
            default_theme_id='science',
        )
        self.assertLessEqual(len(result['teacher_notes']), 600)
        self.assertLessEqual(len(result['usage_instructions']), 6)
        self.assertTrue(all(len(s) <= 200 for s in result['usage_instructions']))
        self.assertLessEqual(len(result['transitions']['0']), 40)

    def test_non_dict_returns_fallback(self) -> None:
        self.assertEqual(
            _validate_finishing_payload('not a dict', default_theme_id='science'),
            {'theme_id': 'science', 'source': 'fallback'},
        )
