from __future__ import annotations

from django.test import SimpleTestCase

from apps.worksheets.services.creative_html_reflow import (
    apply_creative_reflow_if_needed,
    reflow_creative_html_pages,
)


class CreativeHtmlReflowTests(SimpleTestCase):
    def _page_setup_tight(self) -> dict:
        return {'content_line_budget': {'max_line_units_per_page': 18}}

    def test_reflow_splits_many_flow_items(self) -> None:
        parts = []
        for i in range(10):
            parts.append(
                f'<section class="ws-flow-item"><p>{"Text " * 30} Abschnitt {i}.</p></section>',
            )
        inner = ''.join(parts)
        html = f'<div class="ws-creative-page-inner">{inner}</div>'
        pages = [{'page_label': 'Thema X', 'html': html, 'page_css': '.ws-creative-page-inner p{margin:0}'}]
        out, notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertTrue(changed)
        self.assertGreaterEqual(len(out), 2)
        self.assertTrue(any('layout (Kreativ)' in n for n in notes))

    def test_reflow_no_sections_small_page_unchanged(self) -> None:
        html = '<div class="ws-creative-page-inner"><p>Ohne Abschnitte.</p></div>'
        pages = [{'page_label': '', 'html': html, 'page_css': ''}]
        out, notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertFalse(changed)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]['html'], html)
        self.assertEqual(notes, [])

    def test_no_ws_flow_sections_means_no_fragmentation(self) -> None:
        """Ohne ws-flow-item bleibt der Inhalt zusammen — wir zerstückeln nicht an <p>/<svg>-Grenzen.

        (Das war der Bug, bei dem ein einzelnes Aufgabenbild auf eine eigene Seite wanderte.)
        """
        paras = ''.join([f'<p>{"Zeile " * 90} Nr. {i}.</p>' for i in range(28)])
        html = f'<div class="ws-creative-page-inner">{paras}</div>'
        pages = [{'page_label': 'F', 'html': html, 'page_css': ''}]
        out, _notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertFalse(changed)
        self.assertEqual(len(out), 1)

    def test_section_with_many_svgs_stays_atomic(self) -> None:
        """Eine Aufgabe mit Anweisung + vielen Themen-SVGs bleibt **eine** Seite — nicht zerschnitten."""
        svgs = ''.join('<svg width="32" height="32"><circle cx="16" cy="16" r="14"/></svg>' for _ in range(20))
        section = f'<section class="ws-flow-item"><h2>Zähle die Monster</h2>{svgs}</section>'
        html = f'<div class="ws-creative-page-inner">{section}</div>'
        pages = [{'page_label': 'Zählen', 'html': html, 'page_css': ''}]
        out, _notes, changed = reflow_creative_html_pages(pages, self._page_setup_tight())
        self.assertFalse(changed)
        self.assertEqual(len(out), 1)
        self.assertIn('Zähle die Monster', out[0]['html'])

    def test_apply_keeps_original_when_no_structure(self) -> None:
        content = {
            'title': 'T',
            'pages': [{'page_label': '', 'html': '<div class="x">bad root</div>', 'page_css': ''}],
        }
        merged, notes = apply_creative_reflow_if_needed(content, self._page_setup_tight())
        self.assertIs(merged, content)
        self.assertEqual(notes, [])


class CreativeCssSanitizeTests(SimpleTestCase):
    """Worksheet-spezifische Säuberung: papierweiß, keine Schatten, keine Web-UI-Anmutung."""

    def _strip(self, css: str) -> tuple[str, list[str]]:
        from apps.worksheets.services.creative_html_pipeline import _strip_creative_css_decorations

        return _strip_creative_css_decorations(css)

    def test_strips_background_on_page_inner_root(self) -> None:
        css = '.ws-creative-page-inner { background: #efefef; padding: 1rem; }'
        out, notes = self._strip(css)
        self.assertNotIn('background', out)
        self.assertIn('padding', out)
        self.assertTrue(any('Hintergrundfarbe' in n for n in notes))

    def test_strips_background_on_body_and_root(self) -> None:
        for selector in ('body', 'html', ':root', 'html, body'):
            css = '%s { background: #f5f5f5; color: #111; }' % selector
            out, _notes = self._strip(css)
            self.assertNotIn('background', out, msg=f'Selektor {selector!r} sollte Hintergrund verlieren')
            self.assertIn('color', out)

    def test_keeps_background_on_inner_child_element(self) -> None:
        css = '.ws-creative-page-inner .info-card { background: #fff7ec; padding: 1rem; }'
        out, notes = self._strip(css)
        self.assertIn('background', out)
        self.assertEqual(notes, [])

    def test_strips_box_shadow_globally(self) -> None:
        css = '.ws-creative-page-inner .card { box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 0.5rem; }'
        out, notes = self._strip(css)
        self.assertNotIn('box-shadow', out)
        self.assertIn('padding', out)
        self.assertTrue(any('Schatten' in n for n in notes))

    def test_strips_text_shadow_globally(self) -> None:
        css = '.ws-creative-page-inner h1 { text-shadow: 1px 1px 2px #888; font-size: 24px; }'
        out, notes = self._strip(css)
        self.assertNotIn('text-shadow', out)
        self.assertIn('font-size', out)
        self.assertTrue(any('Schatten' in n for n in notes))

    def test_empty_css_returns_unchanged(self) -> None:
        self.assertEqual(self._strip(''), ('', []))
        self.assertEqual(self._strip('   '), ('   ', []))
