"""Pro-Baustein-Smoke: jedes Default-Content validiert via Schema, Render erzeugt HTML."""
from __future__ import annotations

from django.test import SimpleTestCase

from apps.boards.services.blocks.registry import BLOCKS
from apps.boards.services.blocks.themes import resolve_theme


class PerBlockSchemaTests(SimpleTestCase):
    def test_each_default_content_validates_and_renders(self) -> None:
        theme = resolve_theme('science')
        for definition in BLOCKS:
            with self.subTest(block=definition.id):
                content_obj = definition.content_schema.model_validate(definition.default_content)
                rendered = definition.render(content_obj, theme)
                for key in ('html', 'css', 'js', 'used_libraries'):
                    self.assertIn(key, rendered, f'{definition.id} fehlt key "{key}" im Render-Output')
                self.assertGreater(len(rendered['html']), 10, f'{definition.id} liefert zu wenig HTML')

    def test_known_categories_only(self) -> None:
        allowed = {'universal', 'sprache', 'diskussion', 'diagramme', 'mathematik'}
        for definition in BLOCKS:
            with self.subTest(block=definition.id):
                self.assertIn(definition.category, allowed, f'{definition.id} hat fremde Kategorie {definition.category}')

    def test_size_weight_is_1_2_or_3(self) -> None:
        for definition in BLOCKS:
            self.assertIn(definition.size_weight, (1, 2, 3), definition.id)
