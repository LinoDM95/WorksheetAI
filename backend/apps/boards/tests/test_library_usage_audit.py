from django.test import SimpleTestCase

from apps.boards.services.free_html_library_usage_audit import audit_optional_library_usage


class LibraryUsageAuditTests(SimpleTestCase):
    def test_audit_confetti_without_library(self) -> None:
        bundle = {
            'javascript': "window.confetti({ particleCount: 40 });",
            'used_libraries': [],
        }
        errs = audit_optional_library_usage(bundle)
        self.assertTrue(errs)
        self.assertTrue(any('confetti' in e.lower() for e in errs))

    def test_audit_confetti_with_library_clean(self) -> None:
        bundle = {
            'javascript': "window.confetti({ particleCount: 40 });",
            'used_libraries': ['confetti'],
        }
        self.assertEqual(audit_optional_library_usage(bundle), [])

    def test_audit_empty_js(self) -> None:
        self.assertEqual(
            audit_optional_library_usage({'javascript': '', 'used_libraries': []}),
            [],
        )
