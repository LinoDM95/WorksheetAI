from django.test import SimpleTestCase

from apps.worksheets.services.worksheet_thumbnail_preview import first_page_render_model_for_thumbnail


class WorksheetThumbnailPreviewTests(SimpleTestCase):
    def test_none_and_empty(self) -> None:
        self.assertIsNone(first_page_render_model_for_thumbnail(None))
        self.assertIsNone(first_page_render_model_for_thumbnail({}))
        self.assertIsNone(first_page_render_model_for_thumbnail({'pages': []}))

    def test_first_page_only_when_pages(self) -> None:
        rm = {
            'pages': [
                {'page_label': 'A', 'blocks': [{'id': 1}]},
                {'page_label': 'B', 'blocks': [{'id': 2}]},
            ],
            'theme': 'neutral',
        }
        out = first_page_render_model_for_thumbnail(rm)
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(len(out['pages']), 1)
        self.assertEqual(out['pages'][0]['page_label'], 'A')
        self.assertEqual(out['theme'], 'neutral')

    def test_blocks_without_pages(self) -> None:
        rm = {'blocks': [{'t': 'x'}]}
        out = first_page_render_model_for_thumbnail(rm)
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out['blocks'], [{'t': 'x'}])

    def test_creative_kind_without_pages(self) -> None:
        rm = {'version': 'html-a4-creative-v1', 'pages': []}
        out = first_page_render_model_for_thumbnail(rm)
        self.assertIsNotNone(out)
