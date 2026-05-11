"""Anonyme Schüler-Präsenz: öffentlicher POST + Zähler nur für Board-Inhaber."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.boards.models import Board
from apps.boards.services import student_presence


class StudentPresenceTests(TestCase):
    def setUp(self) -> None:
        cache.clear()
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='teach', password='x')
        self.other = get_user_model().objects.create_user(username='other', password='x')
        self.board = Board.objects.create(
            owner=self.user,
            title='B',
            subject='M',
            grade='5',
            topic='T',
            board_type='interactive_board',
            status='generated',
            html='<div class="free-board"></div>',
            css='',
            javascript='',
            share_token='tokpresence1',
            student_link_enabled=True,
            student_link_expires_at=timezone.now() + timedelta(hours=1),
        )

    def test_public_presence_404_unknown_token(self) -> None:
        r = self.client.post(
            '/api/boards/public-play/unknown-token-xyz/presence/',
            {'client_id': 'abc-1', 'action': 'touch'},
            format='json',
        )
        self.assertEqual(r.status_code, 404)

    def test_public_presence_404_when_disabled(self) -> None:
        self.board.student_link_enabled = False
        self.board.save(update_fields=['student_link_enabled'])
        r = self.client.post(
            '/api/boards/public-play/tokpresence1/presence/',
            {'client_id': 'abc-1', 'action': 'touch'},
            format='json',
        )
        self.assertEqual(r.status_code, 404)

    def test_touch_and_owner_count(self) -> None:
        r = self.client.post(
            '/api/boards/public-play/tokpresence1/presence/',
            {'client_id': 'dev-abc-1', 'action': 'touch'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data.get('ok'))

        self.client.force_authenticate(user=self.user)
        g = self.client.get(f'/api/boards/{self.board.id}/student-presence/')
        self.assertEqual(g.status_code, 200)
        self.assertEqual(g.data.get('connected'), 1)

    def test_leave_reduces_count(self) -> None:
        self.client.post(
            '/api/boards/public-play/tokpresence1/presence/',
            {'client_id': 'leave-me', 'action': 'touch'},
            format='json',
        )
        self.client.post(
            '/api/boards/public-play/tokpresence1/presence/',
            {'client_id': 'leave-me', 'action': 'leave'},
            format='json',
        )
        n = student_presence.count_connected('tokpresence1')
        self.assertEqual(n, 0)

    def test_owner_sees_zero_when_link_expired(self) -> None:
        self.client.post(
            '/api/boards/public-play/tokpresence1/presence/',
            {'client_id': 'x1', 'action': 'touch'},
            format='json',
        )
        self.board.student_link_expires_at = timezone.now() - timedelta(minutes=1)
        self.board.save(update_fields=['student_link_expires_at'])
        self.client.force_authenticate(user=self.user)
        g = self.client.get(f'/api/boards/{self.board.id}/student-presence/')
        self.assertEqual(g.status_code, 200)
        self.assertEqual(g.data.get('connected'), 0)

    def test_other_user_cannot_access_board_presence(self) -> None:
        self.client.force_authenticate(user=self.other)
        g = self.client.get(f'/api/boards/{self.board.id}/student-presence/')
        self.assertEqual(g.status_code, 404)
