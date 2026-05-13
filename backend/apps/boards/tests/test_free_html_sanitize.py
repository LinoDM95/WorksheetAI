from __future__ import annotations

import shutil
import unittest

from django.test import SimpleTestCase

from apps.boards.services import free_html_sanitize as san


class SanitizeHtmlTests(SimpleTestCase):
    def test_strips_script_and_notes(self) -> None:
        raw = '<p>Hi</p><script>alert(1)</script>'
        out, notes = san.sanitize_html_fragment(raw)
        self.assertNotIn('script', out.lower())
        self.assertIn('Hi', out)
        self.assertTrue(any('script' in n.lower() for n in notes))

    def test_validate_html_rejects_script(self) -> None:
        errs = san.validate_html_fragment('<script>x</script>')
        self.assertTrue(any('<script>' in e for e in errs))


class SanitizeCssJsTests(SimpleTestCase):
    def test_validate_css_rejects_import(self) -> None:
        errs = san.validate_css('@import url("x"); body{}')
        self.assertTrue(any('import' in e.lower() for e in errs))

    def test_sanitize_css_strips_external_url(self) -> None:
        out, _notes = san.sanitize_css('a{background:url(https://evil.com/x)}')
        self.assertNotIn('evil.com', out)
        self.assertIn('external url removed', out)

    def test_sanitize_css_keeps_generated_assets_url(self) -> None:
        css = 'a{background:url(/board-generated-assets/abc-123.svg)}'
        out, _notes = san.sanitize_css(css)
        self.assertIn('/board-generated-assets/abc-123.svg', out)

    def test_sanitize_html_strips_external_img_src(self) -> None:
        raw = '<img src="https://evil.com/p.png" alt="x">'
        out, notes = san.sanitize_html_fragment(raw)
        self.assertNotIn('evil.com', out)
        self.assertTrue(any('externe' in n.lower() for n in notes))

    def test_sanitize_html_keeps_generated_assets_img_src(self) -> None:
        raw = '<img src="/board-generated-assets/abc.svg" alt="ok">'
        out, _notes = san.sanitize_html_fragment(raw)
        self.assertIn('/board-generated-assets/abc.svg', out)

    def test_validate_js_rejects_fetch(self) -> None:
        errs = san.validate_javascript("fetch('/api')")
        self.assertTrue(any('fetch' in e.lower() for e in errs))

    @unittest.skipUnless(shutil.which('node'), 'Node.js nicht im PATH')
    def test_validate_js_syntax_invalid_token(self) -> None:
        errs = san.validate_javascript("const broken = ;")
        self.assertTrue(
            any('syntax' in e.lower() or 'unexpected' in e.lower() for e in errs),
            errs,
        )

    @unittest.skipUnless(shutil.which('node'), 'Node.js nicht im PATH')
    def test_validate_js_syntax_valid(self) -> None:
        errs = san.validate_javascript("(function () { return 1; })();")
        self.assertFalse(any('JavaScript-Syntax' in e for e in errs))

    def test_sanitize_bundle_merges_warnings_and_caps_notes(self) -> None:
        long_notes = 'x' * 9000
        payload = {
            'html': '<p>ok</p>',
            'css': '',
            'javascript': '',
            'teacher_notes': long_notes,
            'warnings': ['keep'],
        }
        out = san.sanitize_free_html_bundle(payload)
        self.assertLessEqual(len(out['teacher_notes']), 8000)
        self.assertEqual(out['warnings'][0], 'keep')


class ValidateBundleTests(SimpleTestCase):
    def test_validate_bundle_ok_clean(self) -> None:
        bundle = {'html': '<p>x</p>', 'css': 'p{}', 'javascript': 'console.log(1)'}
        ok, errs, warns = san.validate_free_html_bundle(bundle)
        self.assertTrue(ok)
        self.assertEqual(errs, [])

    def test_validate_bundle_fail_on_script(self) -> None:
        bundle = {'html': '<script>a</script>', 'css': '', 'javascript': ''}
        ok, errs, _ = san.validate_free_html_bundle(bundle)
        self.assertFalse(ok)
        self.assertTrue(errs)
