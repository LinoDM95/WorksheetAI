"""API-Smoke: GET /blocks/ + POST /generate-blocks/ (Plan-Eingabe)."""
from __future__ import annotations

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .test_block_generation_service import SAMPLE_PLAN


@override_settings(
    API_REQUIRE_AUTH=False,
    BOARDS_VISUAL_QA_ALLOWED=False,
    BOARDS_BLOCKS_FINISHING_ENABLED=False,
    AI_PROVIDER='mock',
)
class BlocksApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_blocks_endpoint_lists_all_v1_ids(self) -> None:
        resp = self.client.get('/api/boards/blocks/')
        self.assertEqual(resp.status_code, 200)
        ids = [b['id'] for b in resp.data['blocks']]
        for required in [
            'textkarte', 'aufdeckkarte', 'schritt', 'multiple_choice',
            'richtig_falsch', 'sortier', 'zuordnung', 'lueckentext',
            'wortarten', 'pro_contra', 'balken_chart', 'linien_chart',
            'zahlenstrahl',
        ]:
            self.assertIn(required, ids)
        self.assertTrue(any(c['id'] == 'universal' for c in resp.data['categories']))
        self.assertTrue(any(t['id'] == 'science' for t in resp.data['themes']))

    def test_generate_blocks_endpoint_accepts_plan(self) -> None:
        resp = self.client.post('/api/boards/generate-blocks/', SAMPLE_PLAN, format='json')
        self.assertEqual(resp.status_code, 201, resp.data if hasattr(resp, 'data') else resp.content)
        self.assertEqual(resp.data['status'], 'generated')
        self.assertIn('chartjs', resp.data['used_libraries'])

    def test_generate_blocks_returns_400_for_invalid(self) -> None:
        resp = self.client.post('/api/boards/generate-blocks/', {'pages': []}, format='json')
        self.assertEqual(resp.status_code, 400)
