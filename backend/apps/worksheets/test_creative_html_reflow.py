from __future__ import annotations

from django.test import SimpleTestCase

from apps.worksheets.services.creative_html_reflow import (
    apply_creative_reflow_if_needed,
    reflow_creative_html_pages,
)


class CreativeHtmlReflowTests(SimpleTestCase):
    def _page_setup_tight(self) -> dict:
        return {'content_line_budget': {'max_line_units_per_page': 18}}

    def test_reflow_splits_many_flow_items(self):
        parts = []
        for i in range(10):
            parts.append(
                f'<section class="ws-flow-item"><p>{"Text " * 30} Abschnitt {i}.</p></section>',
            )
        inner = ''.join(parts)
        html = f'<div class="ws-creative-page-inner">{inner}</div>'
        pages = [{'page_label': 'Thema X', 'html': html, 'page_css': '.ws-creative-page-inner p{{margin:0}}'}]
        out, notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertTrue(changed)
        self.assertGreaterEqual(len(out), 2)
        self.assertTrue(any('layout (Kreativ)' in n for n in notes))

    def test_reflow_no_sections_small_page_unchanged(self):
        html = '<div class="ws-creative-page-inner"><p>Ohne Abschnitte.</p></div>'
        pages = [{'page_label': '', 'html': html, 'page_css': ''}]
        out, notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertFalse(changed)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['html'], html)
        self.assertEqual(notes, [])

    def test_reflow_fallback_splits_without_ws_flow_sections(self):
        paras = ''.join([f'<p>{"Zeile " * 90} Nr. {i}.</p>' for i in range(28)])
        inner = paras
        html = f'<div class="ws-creative-page-inner">{inner}</div>'
        pages = [{'page_label': 'F', 'html': html, 'page_css': ''}]
        out, notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertTrue(changed)
        self.assertGreaterEqual(len(out), 2)
        self.assertTrue(any('layout (Kreativ)' in n for n in notes))

    def test_burst_single_enormous_flow_section_into_multiple_pages(self):
        hugo = '<p>' + ('Wortausfüllung sichert Breite. ' * 520) + '</p>'
        inner = f'<section class="ws-flow-item">{hugo}</section>'
        html = f'<div class="ws-creative-page-inner">{inner}</div>'
        pages = [{'page_label': 'Einer', 'html': html, 'page_css': ''}]
        out, notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertTrue(changed)
        self.assertGreaterEqual(len(out), 2)

    def test_apply_keeps_original_when_no_structure(self):
        content = {
            'title': 'T',
            'pages': [{'page_label': '', 'html': '<div class="x">bad root</div>', 'page_css': ''}],
        }
        merged, notes = apply_creative_reflow_if_needed(content, self._page_setup_tight())
        self.assertIs(merged, content)
        self.assertEqual(notes, [])
