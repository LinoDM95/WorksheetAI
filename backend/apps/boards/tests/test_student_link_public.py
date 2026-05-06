"""Öffentlicher Schüler-Zugang (share_token): nur mit gültigem Ablaufdatum."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.boards.models import Board


class PublicStudentLinkTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='t', password='x')
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
            share_token='toktest123',
            student_link_enabled=True,
        )

    def test_public_play_404_without_expiry(self) -> None:
        self.board.student_link_expires_at = None
        self.board.save(update_fields=['student_link_expires_at'])
        r = self.client.get('/api/boards/public-play/toktest123/')
        self.assertEqual(r.status_code, 404)

    def test_public_play_404_expired(self) -> None:
        self.board.student_link_expires_at = timezone.now() - timedelta(minutes=1)
        self.board.save(update_fields=['student_link_expires_at'])
        r = self.client.get('/api/boards/public-play/toktest123/')
        self.assertEqual(r.status_code, 404)

    def test_public_play_200_when_valid(self) -> None:
        self.board.student_link_expires_at = timezone.now() + timedelta(hours=1)
        self.board.save(update_fields=['student_link_expires_at'])
        r = self.client.get('/api/boards/public-play/toktest123/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data.get('title'), 'B')

    def test_patch_enabling_link_sets_expiry(self) -> None:
        self.client.force_authenticate(user=self.user)
        b = Board.objects.create(
            owner=self.user,
            title='N',
            subject='M',
            grade='5',
            topic='T',
            board_type='interactive_board',
            status='generated',
            html='<div class="free-board"></div>',
            css='',
            javascript='',
        )
        r = self.client.patch(
            f'/api/boards/{b.id}/',
            {'student_link_enabled': True},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        b.refresh_from_db()
        self.assertTrue(b.student_link_enabled)
        self.assertIsNotNone(b.student_link_expires_at)
        self.assertGreater(b.student_link_expires_at, timezone.now())
