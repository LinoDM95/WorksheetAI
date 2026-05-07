"""Backoffice: Quelltext-Vorschau nur für Staff, nur bei ausstehender Bibliotheks-Einreichung."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.boards.models import Board
from apps.worksheets.models import Worksheet


@override_settings(API_REQUIRE_AUTH=False)
class BackofficePreviewTests(TestCase):
    def setUp(self) -> None:
        User = get_user_model()
        self.client = APIClient()
        self.owner = User.objects.create_user(username='bop_owner', password='x')
        self.staff = User.objects.create_user(username='bop_staff', password='x', is_staff=True)
        self.other = User.objects.create_user(username='bop_user', password='x')
        self.board = Board.objects.create(
            owner=self.owner,
            title='T',
            subject='Mathe',
            grade='5',
            topic='x',
            board_type='interactive_board',
            status='generated',
            html='<main>H</main>',
            css='.x{}',
            javascript='console.log(1)',
            used_libraries=['leaflet'],
            used_datasets=['d1'],
            library_moderation_status=Board.LibraryModerationStatus.PENDING,
        )
        self.worksheet = Worksheet.objects.create(
            owner=self.owner,
            title='WS',
            subject='Deutsch',
            content={'version': 1, 'pages': []},
            library_moderation_status=Worksheet.LibraryModerationStatus.PENDING,
        )

    def test_board_preview_staff_sees_bundle(self) -> None:
        self.client.force_authenticate(user=self.staff)
        r = self.client.get(f'/api/auth/backoffice/boards/{self.board.id}/preview/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['html'], '<main>H</main>')
        self.assertEqual(r.data['css'], '.x{}')
        self.assertEqual(r.data['javascript'], 'console.log(1)')
        self.assertEqual(r.data['used_libraries'], ['leaflet'])

    def test_board_preview_non_staff_403(self) -> None:
        self.client.force_authenticate(user=self.other)
        r = self.client.get(f'/api/auth/backoffice/boards/{self.board.id}/preview/')
        self.assertEqual(r.status_code, 403)

    def test_board_preview_not_pending_400(self) -> None:
        self.board.library_moderation_status = Board.LibraryModerationStatus.APPROVED
        self.board.save(update_fields=['library_moderation_status'])
        self.client.force_authenticate(user=self.staff)
        r = self.client.get(f'/api/auth/backoffice/boards/{self.board.id}/preview/')
        self.assertEqual(r.status_code, 400)

    def test_worksheet_preview_staff(self) -> None:
        self.client.force_authenticate(user=self.staff)
        r = self.client.get(f'/api/auth/backoffice/worksheets/{self.worksheet.id}/preview/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['title'], 'WS')
        self.assertEqual(r.data['content'], {'version': 1, 'pages': []})
