"""Theme-Resolver: stabile Defaults, alle Tokens vorhanden."""
from __future__ import annotations

from django.test import SimpleTestCase

from apps.boards.services.blocks.themes import (
    DEFAULT_THEME_ID,
    THEME_BY_ID,
    THEMES,
    resolve_theme,
    theme_to_css_vars,
)


REQUIRED_TOKENS = {
    'bg', 'bg_card', 'bg_chip', 'text', 'text_muted',
    'primary', 'primary_text', 'accent', 'success', 'danger', 'focus',
    'font_family', 'font_size_md', 'radius_md', 'gap_md', 'touch_min',
}


class ThemeResolveTests(SimpleTestCase):
    def test_default_resolves_for_empty_input(self) -> None:
        self.assertEqual(resolve_theme(None).id, DEFAULT_THEME_ID)
        self.assertEqual(resolve_theme('').id, DEFAULT_THEME_ID)
        self.assertEqual(resolve_theme('auto').id, DEFAULT_THEME_ID)

    def test_unknown_falls_back_to_default(self) -> None:
        self.assertEqual(resolve_theme('not-a-theme').id, DEFAULT_THEME_ID)

    def test_each_theme_has_required_tokens(self) -> None:
        for theme in THEMES:
            with self.subTest(theme=theme.id):
                missing = REQUIRED_TOKENS - theme.tokens.keys()
                self.assertFalse(missing, f'{theme.id} fehlt Tokens: {missing}')

    def test_css_vars_render(self) -> None:
        css = theme_to_css_vars(THEME_BY_ID[DEFAULT_THEME_ID])
        self.assertIn('--bb-primary:', css)
        self.assertIn('--bb-bg:', css)
