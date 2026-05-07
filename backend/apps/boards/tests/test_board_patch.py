"""Direkte Tests für Board-PATCH-Service (Regression nach Auslagerung aus views)."""
from __future__ import annotations

from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.boards.models import Board
from apps.boards.services.board_patch import patch_board_with_validation


@override_settings(API_REQUIRE_AUTH=False)
class BoardPatchServiceTests(TestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(username='patch-t', password='x')
        self.board = Board.objects.create(
            owner=self.user,
            title='T',
            subject='S',
            grade='5',
            topic='K',
            board_type='interactive_board',
            status='generated',
            html='<div class="free-board">x</div>',
            css='',
            javascript='',
        )

    def test_patch_title_returns_200_and_persists(self) -> None:
        request = SimpleNamespace(user=self.user, data={'title': 'Neu'})
        resp = patch_board_with_validation(request=request, instance=self.board, _partial=True)
        self.assertEqual(resp.status_code, 200)
        self.board.refresh_from_db()
        self.assertEqual(self.board.title, 'Neu')
