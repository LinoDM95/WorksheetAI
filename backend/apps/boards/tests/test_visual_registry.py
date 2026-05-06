from __future__ import annotations

from django.test import SimpleTestCase

from apps.boards.services.visual_resource_registry import (
    always_loaded_library_ids,
    filter_used_assets,
    filter_used_datasets,
    filter_used_libraries,
    summarize_libraries,
)


class VisualResourceRegistryTests(SimpleTestCase):
    def test_filter_libraries_keeps_known_ids(self) -> None:
        self.assertEqual(filter_used_libraries(['d3', 'nope', 'roughjs']), ['d3', 'roughjs'])

    def test_filter_non_list_returns_empty(self) -> None:
        self.assertEqual(filter_used_libraries(None), [])
        self.assertEqual(filter_used_assets('x'), [])
        self.assertEqual(filter_used_datasets(1), [])

    def test_always_loaded_includes_d3(self) -> None:
        ids = always_loaded_library_ids()
        self.assertIn('d3', ids)
        self.assertIn('roughjs', ids)

    def test_newPhysics_libs_are_known(self) -> None:
        self.assertEqual(
            filter_used_libraries(['matterjs', 'interactjs', 'nope', 'gsap']),
            ['matterjs', 'interactjs', 'gsap'],
        )

    def test_summarize_libraries_mentions_window_global(self) -> None:
        md = summarize_libraries()
        self.assertIn('window.', md)
        self.assertIn('d3', md)
