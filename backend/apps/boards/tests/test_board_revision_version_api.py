"""API-Tests für Board-Versionierung (Kopf, Wiederherstellen, Löschen)."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.boards.models import Board, BoardRevision


@override_settings(
    API_REQUIRE_AUTH=False,
    BOARDS_AI_PROVIDER='mock',
    AI_PROVIDER='mock',
    BOARDS_VISUAL_QA_ALLOWED=False,
)
class BoardRevisionVersionApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='t1', password='x')
        self.client.force_authenticate(user=self.user)
        self.board = Board.objects.create(
            owner=self.user,
            title='B1',
            subject='S',
            grade='5',
            topic='T',
            board_type='interactive_board',
            status='generated',
            html='<div class="free-board">v1</div>',
            css='',
            javascript='',
        )
        self.r1 = BoardRevision.objects.create(
            board=self.board,
            prompt='(Erstfassung)',
            revision_mode='general',
            previous_html='',
            previous_css='',
            previous_javascript='',
            previous_metadata={},
            new_html=self.board.html,
            new_css='',
            new_javascript='',
            new_metadata={
                'title': self.board.title,
                'description': '',
                'teacher_notes': '',
                'usage_instructions': [],
                'warnings': [],
                'used_libraries': [],
                'used_assets': [],
                'used_datasets': [],
            },
            ai_raw_output={},
            validation_errors=[],
            validation_warnings=[],
            created_by=self.user,
        )
        self.board.html = '<div class="free-board">head</div>'
        self.board.save(update_fields=['html', 'updated_at'])
        self.r2 = BoardRevision.objects.create(
            board=self.board,
            prompt='Änderung',
            revision_mode='general',
            previous_html=self.r1.new_html,
            previous_css='',
            previous_javascript='',
            previous_metadata=self.r1.new_metadata,
            new_html=self.board.html,
            new_css='',
            new_javascript='',
            new_metadata={
                **self.r1.new_metadata,
                'title': self.board.title,
            },
            ai_raw_output={},
            validation_errors=[],
            validation_warnings=[],
            created_by=self.user,
        )
        self.board.html = '<div class="free-board">off-head</div>'
        self.board.save(update_fields=['html', 'updated_at'])

    def test_detail_includes_head_flags(self) -> None:
        resp = self.client.get(f'/api/boards/{self.board.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get('revision_head_id'), str(self.r2.id))
        self.assertFalse(resp.data.get('can_revise_with_ai'))

    def test_revise_only_on_head(self) -> None:
        resp = self.client.post(
            f'/api/boards/{self.board.id}/revise/',
            {'prompt': 'x', 'revision_mode': 'general'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_apply_old_revision_makes_head(self) -> None:
        self.board.html = self.r2.new_html
        self.board.save(update_fields=['html', 'updated_at'])
        payload = {'revision_id': str(self.r1.id)}
        resp = self.client.post(
            f'/api/boards/{self.board.id}/apply-revision/',
            payload,
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.board.refresh_from_db()
        self.assertIn('v1', self.board.html)
        latest = self.board.revisions.order_by('-created_at').first()
        self.assertIsNotNone(latest)
        self.assertIn('Wiederherstellung', latest.prompt)

    def test_cannot_delete_latest_revision(self) -> None:
        resp = self.client.post(
            f'/api/boards/{self.board.id}/delete-revision/',
            {'revision_id': str(self.r2.id)},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_can_delete_non_latest(self) -> None:
        self.board.html = self.r2.new_html
        self.board.save(update_fields=['html', 'updated_at'])
        resp = self.client.post(
            f'/api/boards/{self.board.id}/delete-revision/',
            {'revision_id': str(self.r1.id)},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(BoardRevision.objects.filter(pk=self.r1.pk).exists())
