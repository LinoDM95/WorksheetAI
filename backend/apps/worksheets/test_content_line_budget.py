from __future__ import annotations

from django.test import SimpleTestCase

from apps.worksheets.services.content_line_budget import compute_content_line_budget


class ContentLineBudgetTests(SimpleTestCase):
    def test_positive_max_units(self) -> None:
        b = compute_content_line_budget(
            {'orientation': 'portrait', 'safe_area': {'height_mm': 240.0, 'width_mm': 170.0}},
        )
        self.assertIn('max_line_units_per_page', b)
        self.assertGreaterEqual(b['max_line_units_per_page'], 8)
        self.assertEqual(b['model'], 'latex_baselineskip_a4')

    def test_fallback_safe_height_when_missing(self) -> None:
        b = compute_content_line_budget({})
        self.assertGreater(float(b['safe_area_height_mm']), 100)
