"""Unit-Tests für chirurgische Board-Revision (Search-Replace)."""
from django.test import SimpleTestCase

from apps.boards.services.free_html_surgical_edits import (
    SurgicalRevisionError,
    apply_surgical_edits,
    expand_surgical_revision_raw,
    normalize_provider_free_html_response,
)


class ApplySurgicalEditsTests(SimpleTestCase):
    def test_one_replace_html(self):
        h, c, j, err = apply_surgical_edits(
            html='<div class="x">alt</div>',
            css='',
            javascript='',
            edits=[{'target': 'html', 'old_text': 'alt', 'new_text': 'neu'}],
        )
        self.assertEqual(err, [])
        self.assertEqual(h, '<div class="x">neu</div>')
        self.assertEqual(c, '')
        self.assertEqual(j, '')

    def test_sequence_two_targets(self):
        h, c, j, err = apply_surgical_edits(
            html='<p>a</p>',
            css='.a{color:red}',
            javascript='',
            edits=[
                {'target': 'css', 'old_text': 'red', 'new_text': 'blue'},
                {'target': 'html', 'old_text': '<p>a</p>', 'new_text': '<p>b</p>'},
            ],
        )
        self.assertEqual(err, [])
        self.assertEqual(h, '<p>b</p>')
        self.assertEqual(c, '.a{color:blue}')

    def test_ambiguous_old_text_collects_error(self):
        h, c, j, err = apply_surgical_edits(
            html='aa',
            css='',
            javascript='',
            edits=[{'target': 'html', 'old_text': 'a', 'new_text': 'b'}],
        )
        self.assertTrue(err)
        self.assertEqual(h, 'aa')

    def test_expand_surgical_merges(self):
        raw = expand_surgical_revision_raw(
            {
                'revision_kind': 'surgical',
                'title': 'T',
                'html': '',
                'css': '',
                'javascript': '',
                'surgical_edits': [
                    {'target': 'html', 'old_text': '<old>', 'new_text': '<new>'},
                ],
            },
            base_html='<old>',
            base_css='',
            base_javascript='',
        )
        self.assertEqual(raw['html'], '<new>')
        self.assertEqual(raw['revision_kind'], 'surgical')

    def test_expand_surgical_invalid_raises(self):
        with self.assertRaises(SurgicalRevisionError):
            expand_surgical_revision_raw(
                {
                    'revision_kind': 'surgical',
                    'html': '',
                    'css': '',
                    'javascript': '',
                    'surgical_edits': [
                        {'target': 'html', 'old_text': 'nicht da', 'new_text': 'x'},
                    ],
                },
                base_html='<old>',
                base_css='',
                base_javascript='',
            )

    def test_expand_full_passthrough(self):
        raw = expand_surgical_revision_raw(
            {'revision_kind': 'full', 'html': '<x>'},
            base_html='<old>',
            base_css='',
            base_javascript='',
        )
        self.assertEqual(raw['html'], '<x>')

    def test_expand_surgical_no_edits_fills_empty_from_base(self):
        raw = expand_surgical_revision_raw(
            {
                'revision_kind': 'surgical',
                'html': '',
                'css': '',
                'javascript': '',
            },
            base_html='<keep>',
            base_css='*{}',
            base_javascript='void 0;',
        )
        self.assertEqual(raw['html'], '<keep>')
        self.assertEqual(raw['css'], '*{}')
        self.assertEqual(raw['javascript'], 'void 0;')


class NormalizeProviderTests(SimpleTestCase):
    def test_normalize_raises_value_error_on_bad_surgical(self):
        with self.assertRaises(ValueError) as ctx:
            normalize_provider_free_html_response(
                {
                    'revision_kind': 'surgical',
                    'surgical_edits': [{'target': 'html', 'old_text': 'x', 'new_text': 'y'}],
                },
                base_html='<p>a</p>',
                base_css='',
                base_javascript='',
            )
        self.assertIn('old_text', str(ctx.exception))
