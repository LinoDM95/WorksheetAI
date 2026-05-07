from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.boards.models import Board

from rest_framework.test import APIClient


class LibraryCommentsApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.owner = User.objects.create_user(username='owner', password='x')
        self.other = User.objects.create_user(username='other', password='x')
        self.board = Board.objects.create(
            owner=self.owner,
            title='Öffentlich',
            subject='Sach',
            board_type='interactive_board',
            status='generated',
            html='<div>x</div>',
            library_public=True,
            library_moderation_status=Board.LibraryModerationStatus.APPROVED,
        )

    def test_comments_get_post_anonymous_author_label(self) -> None:
        self.client.force_authenticate(user=self.other)
        r_list = self.client.get('/api/boards/library/')
        self.assertEqual(r_list.status_code, 200)
        self.assertIsInstance(r_list.data, list)
        if r_list.data:
            self.assertIn('comment_count', r_list.data[0])
            self.assertIn('viewer_is_owner', r_list.data[0])

        r0 = self.client.get(f'/api/boards/{self.board.id}/library-comments/')
        self.assertEqual(r0.status_code, 200)
        self.assertEqual(r0.data, [])

        r1 = self.client.post(
            f'/api/boards/{self.board.id}/library-comments/',
            {'text': '  Hilfreich im Unterricht  '},
            format='json',
        )
        self.assertEqual(r1.status_code, 201, r1.data)
        self.assertEqual(r1.data.get('author_label'), 'Anonym')
        self.assertEqual(r1.data.get('text'), 'Hilfreich im Unterricht')

        r2 = self.client.get(f'/api/boards/{self.board.id}/library-comments/')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(len(r2.data), 1)
        self.assertEqual(r2.data[0]['author_label'], 'Anonym')

        r_entry = self.client.get(f'/api/boards/{self.board.id}/library-entry/')
        self.assertEqual(r_entry.status_code, 200, r_entry.data)
        self.assertEqual(r_entry.data.get('id'), str(self.board.id))
        self.assertIn('description', r_entry.data)

        self.client.force_authenticate(user=self.owner)
        r_scope = self.client.get('/api/boards/library/?scope=mine')
        self.assertEqual(r_scope.status_code, 200)
        self.assertEqual(len(r_scope.data), 1)
        self.assertTrue(r_scope.data[0].get('viewer_is_owner'))

    def test_library_entry_owner_only_share_fields(self) -> None:
        self.board.share_token = 'owneronlytoken'
        self.board.student_link_enabled = True
        self.board.save(update_fields=['share_token', 'student_link_enabled'])

        self.client.force_authenticate(user=self.other)
        r_other = self.client.get(f'/api/boards/{self.board.id}/library-entry/')
        self.assertEqual(r_other.status_code, 200)
        self.assertIsNone(r_other.data.get('share_token'))
        self.assertFalse(r_other.data.get('student_link_enabled'))
        self.assertIsNone(r_other.data.get('student_link_expires_at'))

        self.client.force_authenticate(user=self.owner)
        r_owner = self.client.get(f'/api/boards/{self.board.id}/library-entry/')
        self.assertEqual(r_owner.status_code, 200)
        self.assertEqual(r_owner.data.get('share_token'), 'owneronlytoken')
        self.assertTrue(r_owner.data.get('student_link_enabled'))
        self.assertIsNone(r_owner.data.get('student_link_expires_at'))

    def test_mine_scope_excludes_foreign_board(self) -> None:
        self.client.force_authenticate(user=self.other)
        r = self.client.get('/api/boards/library/?scope=mine')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, [])

    def test_library_entry_hidden_when_not_public(self) -> None:
        self.board.library_public = False
        self.board.save(update_fields=['library_public'])
        self.client.force_authenticate(user=self.other)
        r = self.client.get(f'/api/boards/{self.board.id}/library-entry/')
        self.assertEqual(r.status_code, 404)
