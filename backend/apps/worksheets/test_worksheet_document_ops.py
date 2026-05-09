from __future__ import annotations

from django.test import SimpleTestCase

from apps.worksheets.services.worksheet_document_ops import (
    apply_document_operations,
    build_document_outline,
    extract_flow_sections,
)


class WorksheetDocumentOpsTests(SimpleTestCase):
    def test_build_document_outline_lists_block_indices(self) -> None:
        pages = [
            {
                'page_label': 'A',
                'blocks': [
                    {'type': 'text', 'title': 'Einstieg'},
                    {'type': 'task_list', 'title': 'Aufgaben'},
                ],
            }
        ]
        out = build_document_outline(pages, creative=False)
        self.assertIn('Seite 0', out)
        self.assertIn('[0]', out)
        self.assertIn('[1]', out)

    def test_insert_page_after_appends(self) -> None:
        content = {
            'pages': [
                {'page_label': '', 'blocks': [{'id': 'a', 'type': 'text', 'title': 't', 'content': 'x'}]},
            ]
        }
        notes, focus = apply_document_operations(
            content,
            [
                {
                    'op': 'insert_page_after',
                    'after_index': 0,
                    'new_page': {
                        'page_label': 'B',
                        'blocks': [{'id': 'b', 'type': 'text', 'title': 'n', 'content': 'y'}],
                    },
                }
            ],
            creative=False,
            focus_page_index=0,
        )
        self.assertEqual(len(content['pages']), 2)
        self.assertEqual(focus, 0)
        self.assertTrue(any('Eingefügt' in n for n in notes))

    def test_move_block(self) -> None:
        content = {
            'pages': [
                {
                    'page_label': '',
                    'blocks': [
                        {'id': '1', 'type': 'text', 'title': 'a', 'content': 'a'},
                        {'id': '2', 'type': 'text', 'title': 'b', 'content': 'b'},
                    ],
                },
                {'page_label': '', 'blocks': [{'id': '3', 'type': 'text', 'title': 'c', 'content': 'c'}]},
            ]
        }
        notes, focus = apply_document_operations(
            content,
            [
                {
                    'op': 'move_block',
                    'from_page': 0,
                    'from_block_index': 1,
                    'to_page': 1,
                    'to_block_index': 0,
                }
            ],
            creative=False,
            focus_page_index=0,
        )
        self.assertEqual(len(content['pages'][0]['blocks']), 1)
        self.assertEqual(len(content['pages'][1]['blocks']), 2)
        self.assertEqual(content['pages'][1]['blocks'][0]['id'], '2')
        self.assertEqual(focus, 0)
        self.assertTrue(notes)

    def test_move_flow_item_creative(self) -> None:
        html0 = (
            '<div class="ws-creative-page-inner">'
            '<section class="ws-flow-item"><p>One</p></section>'
            '<section class="ws-flow-item"><p>Two</p></section>'
            '</div>'
        )
        html1 = (
            '<div class="ws-creative-page-inner">'
            '<section class="ws-flow-item"><p>Three</p></section>'
            '</div>'
        )
        content = {
            'pages': [
                {'page_label': '', 'html': html0, 'page_css': ''},
                {'page_label': '', 'html': html1, 'page_css': ''},
            ]
        }
        notes, _ = apply_document_operations(
            content,
            [
                {
                    'op': 'move_flow_item',
                    'from_page': 0,
                    'from_section_index': 0,
                    'to_page': 1,
                    'to_section_index': 0,
                }
            ],
            creative=True,
            focus_page_index=0,
        )
        p0 = extract_flow_sections(content['pages'][0]['html'])
        p1 = extract_flow_sections(content['pages'][1]['html'])
        self.assertEqual(len(p0), 1)
        self.assertEqual(len(p1), 2)
        self.assertIn('Two', p0[0])
        self.assertIn('One', p1[0])
        self.assertIn('Three', p1[1])
        self.assertTrue(notes)
