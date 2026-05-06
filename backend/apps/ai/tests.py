from __future__ import annotations

from django.test import SimpleTestCase, override_settings
from rest_framework import status

from apps.ai.error_mapper import AIErrorMapper
from apps.ai.gemini_model_fallback import expand_gemini_model_chain, is_gemini_model_availability_error


class GeminiModelFallbackTests(SimpleTestCase):
    @override_settings(GEMINI_MODEL_FALLBACK='gemini-2.5-pro')
    def test_expand_chain_appends_fallback_when_distinct(self) -> None:
        self.assertEqual(
            expand_gemini_model_chain('gemini-3.1-pro-preview'),
            ['gemini-3.1-pro-preview', 'gemini-2.5-pro'],
        )

    @override_settings(GEMINI_MODEL_FALLBACK='')
    def test_expand_chain_no_fallback_when_empty_setting(self) -> None:
        self.assertEqual(expand_gemini_model_chain('gemini-2.5-pro'), ['gemini-2.5-pro'])

    @override_settings(GEMINI_MODEL_FALLBACK='gemini-2.5-pro')
    def test_expand_chain_skips_duplicate_fallback(self) -> None:
        self.assertEqual(expand_gemini_model_chain('gemini-2.5-pro'), ['gemini-2.5-pro'])

    def test_availability_error_detects_not_found_message(self) -> None:
        self.assertTrue(is_gemini_model_availability_error(Exception('404 NOT_FOUND models/foo')))

    def test_deadline_not_model_fallback(self) -> None:
        self.assertFalse(is_gemini_model_availability_error(Exception('DEADLINE_EXCEEDED')))

    def test_quota_not_model_fallback(self) -> None:
        self.assertFalse(is_gemini_model_availability_error(Exception('RESOURCE_EXHAUSTED')))

    def test_availability_error_google_api_error_not_found(self) -> None:
        from google.genai.errors import APIError

        exc = APIError(404, {'error': {'code': 404, 'message': 'not found', 'status': 'NOT_FOUND'}})
        self.assertTrue(is_gemini_model_availability_error(exc))


class AIErrorMapperTests(SimpleTestCase):
    def test_provider_config_missing_gemini_key(self) -> None:
        exc = RuntimeError('Set GEMINI_API_KEY in .env')
        resp = AIErrorMapper.to_response(exc)
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        body = resp.data
        self.assertEqual(body['error_code'], 'provider_config')
        self.assertIn('GEMINI_API_KEY', str(body['detail']))

    def test_provider_config_missing_claude_key(self) -> None:
        exc = RuntimeError('missing CLAUDE_API_KEY')
        m = AIErrorMapper(exc)
        self.assertEqual(m.http_status(), 503)
        self.assertEqual(m.error_code(), 'provider_config')

    def test_resource_exhausted_from_message_maps_429(self) -> None:
        exc = Exception('RESOURCE_EXHAUSTED: quota')
        resp = AIErrorMapper.to_response(exc)
        self.assertEqual(resp.status_code, 429)
        self.assertEqual(resp.data['error_code'], 'resource_exhausted')

    def test_read_timeout_maps_504(self) -> None:
        exc = Exception('HTTPSConnectionPool ReadTimeout')
        resp = AIErrorMapper.to_response(exc)
        self.assertEqual(resp.status_code, status.HTTP_504_GATEWAY_TIMEOUT)
        self.assertEqual(resp.data['error_code'], 'deadline_exceeded')

    def test_generic_failure_maps_502(self) -> None:
        exc = Exception('upstream broken')
        resp = AIErrorMapper.to_response(exc)
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(resp.data['error_code'], 'ai_error')

    def test_to_response_detail_prefix(self) -> None:
        exc = Exception('boom')
        resp = AIErrorMapper.to_response(exc, detail_prefix='Arbeitsblatt')
        self.assertTrue(str(resp.data['detail']).startswith('Arbeitsblatt:'))
