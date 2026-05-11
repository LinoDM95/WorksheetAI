"""API-Antworten für Board-Code (html/css/js) — Abgleich mit DB (Plan: Payload vs. iframe-Inhalt)."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.boards.models import Board


@override_settings(
    API_REQUIRE_AUTH=False,
    BOARDS_AI_PROVIDER='mock',
    AI_PROVIDER='mock',
)
class BoardIframeApiPayloadTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='iframe_payload', password='x')
        self.client.force_authenticate(user=self.user)
        self.html = '<div class="free-board" data-payload="1">Sichtbar</div>'
        self.css = '.free-board { color: navy; }'
        self.javascript = 'console.log("board");'
        self.board = Board.objects.create(
            owner=self.user,
            title='Iframe-Payload',
            subject='S',
            grade='5',
            topic='T',
            board_type='interactive_board',
            status='generated',
            html=self.html,
            css=self.css,
            javascript=self.javascript,
            used_libraries=['chartjs'],
            used_datasets=[],
            share_token='payloadtok',
            student_link_enabled=True,
            student_link_expires_at=timezone.now() + timedelta(hours=2),
        )

    def test_detail_html_css_javascript_match_database(self) -> None:
        r = self.client.get(f'/api/boards/{self.board.id}/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data.get('html'), self.html)
        self.assertEqual(r.data.get('css'), self.css)
        self.assertEqual(r.data.get('javascript'), self.javascript)
        self.assertEqual(r.data.get('used_libraries'), ['chartjs'])
        self.assertGreater(len(r.data.get('html') or ''), 10)

    def test_public_play_bundle_matches_live_board(self) -> None:
        r = self.client.get('/api/boards/public-play/payloadtok/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data.get('html'), self.html)
        self.assertEqual(r.data.get('css'), self.css)
        self.assertEqual(r.data.get('javascript'), self.javascript)
        self.assertEqual(r.data.get('used_libraries'), ['chartjs'])

    def test_empty_board_returns_empty_strings_for_iframe(self) -> None:
        b = Board.objects.create(
            owner=self.user,
            title='Leer',
            subject='S',
            grade='5',
            topic='T',
            board_type='interactive_board',
            status='draft',
            html='',
            css='',
            javascript='',
        )
        r = self.client.get(f'/api/boards/{b.id}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data.get('html'), '')
        self.assertEqual(r.data.get('css'), '')
        self.assertEqual(r.data.get('javascript'), '')
