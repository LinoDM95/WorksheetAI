from __future__ import annotations

from django.test import SimpleTestCase
from rest_framework import status

from apps.ai.error_mapper import AIErrorMapper


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
