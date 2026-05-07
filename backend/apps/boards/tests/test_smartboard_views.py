"""View-Tests für die Smartboard-Pipeline-Endpunkte.

Decken die neuen Actions ab:
- ``GET  /boards/pipeline-status/``
- ``POST /boards/{id}/run-quality-check/``
- ``GET  /boards/{id}/quality-report/``
- ``POST /boards/{id}/auto-repair/`` (Mock-Provider, Heuristik-Pfad)
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.boards.models import Board, BoardRevision


@override_settings(
    API_REQUIRE_AUTH=False,
    BOARDS_VISUAL_QA_ALLOWED=False,
    BOARDS_AI_PROVIDER='mock',
    AI_PROVIDER='mock',
    SMARTBOARD_ENABLE_TOUCH_AUDIT=True,
    SMARTBOARD_ENABLE_SCREENSHOT_JUDGE=False,  # Playwright nicht in Tests
)
class SmartboardPipelineApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='lehrer', password='x')
        self.client.force_authenticate(user=self.user)
        self.board = Board.objects.create(
            owner=self.user,
            title='Board',
            subject='Mathe',
            grade='5',
            topic='Brüche',
            board_type='interactive_board',
            status='generated',
            html='<div class="free-board"><button class="touch-target">Start</button></div>',
            css='.touch-target { min-width: 56px; min-height: 56px; }',
            javascript='',
        )

    def test_pipeline_status_returns_flags(self) -> None:
        resp = self.client.get('/api/boards/pipeline-status/')
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        for key in (
            'use_pipeline', 'small_model', 'large_model',
            'default_quality_mode', 'screenshot_judge_enabled',
            'touch_audit_enabled', 'playwright_available',
        ):
            self.assertIn(key, data)

    def test_quality_report_endpoint_returns_dict(self) -> None:
        resp = self.client.get(f'/api/boards/{self.board.id}/quality-report/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, dict)

    def test_run_quality_check_updates_board(self) -> None:
        resp = self.client.post(f'/api/boards/{self.board.id}/run-quality-check/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.board.refresh_from_db()
        self.assertIsInstance(self.board.touch_audit_result, dict)
        self.assertIn('overall_status', self.board.quality_report or {})
        self.assertIn(self.board.quality_report['overall_status'], ('passed', 'warning', 'failed'))

    def test_auto_repair_creates_revision(self) -> None:
        resp = self.client.post(f'/api/boards/{self.board.id}/auto-repair/',
                                  {'revision_mode': 'general_repair'}, format='json')
        # Mock-Provider liefert {} → Repair "geht durch" mit aktuellem Bundle
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn('board', resp.data)
        self.assertIn('revision', resp.data)
        self.assertEqual(BoardRevision.objects.filter(board=self.board).count(), 1)

    def test_generate_rejects_empty_prompt(self) -> None:
        body = {
            'prompt': '   ',
            'subject': 'Test',
            'topic': 'Thema',
            'grade_from': 5,
            'grade_to': 5,
        }
        resp = self.client.post('/api/boards/generate/', body, format='json')
        self.assertEqual(resp.status_code, 400, getattr(resp, 'data', resp.content))
        self.assertIn('Prompt', str(resp.data.get('detail', '')))

    def test_generate_stream_returns_ndjson_done(self) -> None:
        import json

        body = {
            'prompt': 'Mini-Test: eine Seite mit einem großen Start-Button (min. 64px).',
            'subject': 'Test',
            'topic': 'Smoke',
            'grade_from': 5,
            'grade_to': 5,
        }
        resp = self.client.post(
            '/api/boards/generate/?stream=1',
            body,
            format='json',
        )
        self.assertEqual(resp.status_code, 201, getattr(resp, 'content', b'')[:500])
        if hasattr(resp, 'streaming_content'):
            text = b''.join(resp.streaming_content).decode('utf-8')
        else:
            text = resp.content.decode('utf-8')
        lines = [ln for ln in text.strip().split('\n') if ln.strip()]
        self.assertGreaterEqual(len(lines), 2)
        phase_labels = 0
        for ln in lines[:-1]:
            o = json.loads(ln)
            if o.get('event') == 'phase' and o.get('label'):
                phase_labels += 1
        self.assertGreaterEqual(phase_labels, 1)
        last = json.loads(lines[-1])
        self.assertEqual(last.get('event'), 'done')
        self.assertIn('board', last)
        self.assertTrue(last['board'].get('id'))
