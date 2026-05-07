"""Bibliotheks-Veröffentlichung: Pflichtfelder, Snapshot vs. Live-Code."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.boards.models import Board


@override_settings(API_REQUIRE_AUTH=False)
class BoardLibraryPublishTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='tpub', password='x')
        self.client.force_authenticate(user=self.user)
        self.board = Board.objects.create(
            owner=self.user,
            title='Privat-Titel',
            description='Privat-Beschreibung',
            subject='Mathematik',
            grade='5',
            topic='Privat-Thema',
            board_type='interactive_board',
            status='generated',
            html='<div>v1</div>',
            css='',
            javascript='',
            used_libraries=[],
            used_datasets=[],
            library_public=False,
        )

    def test_first_publish_without_listing_returns_400(self) -> None:
        r = self.client.patch(
            f'/api/boards/{self.board.id}/',
            {'library_public': True},
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_teacher_submit_is_pending_and_not_listed_in_library(self) -> None:
        r = self.client.patch(
            f'/api/boards/{self.board.id}/',
            {
                'library_public': True,
                'library_listing_title': 'Öffentlich Titel',
                'library_listing_topic': 'Öffentlich Thema',
                'library_listing_description': 'Kurzbeschreibung für die Bibliothek.',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.board.refresh_from_db()
        self.assertFalse(self.board.library_public)
        self.assertEqual(self.board.library_moderation_status, Board.LibraryModerationStatus.PENDING)
        lib = self.client.get('/api/boards/library/').data
        self.assertFalse(any(x['id'] == str(self.board.id) for x in lib))

    def test_publish_creates_snapshot_then_live_edit_does_not_change_preview(self) -> None:
        self.user.is_staff = True
        self.user.save(update_fields=['is_staff'])
        r = self.client.patch(
            f'/api/boards/{self.board.id}/',
            {
                'library_public': True,
                'library_listing_title': 'Öffentlich Titel',
                'library_listing_topic': 'Öffentlich Thema',
                'library_listing_description': 'Kurzbeschreibung für die Bibliothek.',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.board.refresh_from_db()
        self.assertTrue(self.board.library_public)
        self.assertEqual(self.board.library_snapshot_html, '<div>v1</div>')

        lib = self.client.get('/api/boards/library/').data
        entry = next(x for x in lib if x['id'] == str(self.board.id))
        self.assertEqual(entry['title'], 'Öffentlich Titel')
        self.assertEqual(entry['topic'], 'Öffentlich Thema')
        self.assertEqual(entry['description'], 'Kurzbeschreibung für die Bibliothek.')

        r2 = self.client.patch(
            f'/api/boards/{self.board.id}/',
            {'html': '<div>v2-privat</div>'},
            format='json',
        )
        self.assertEqual(r2.status_code, 200)
        self.board.refresh_from_db()

        lib2 = self.client.get('/api/boards/library/').data
        entry2 = next(x for x in lib2 if x['id'] == str(self.board.id))
        self.assertEqual(entry2['html'], '<div>v1</div>')
        self.assertEqual(self.board.html, '<div>v2-privat</div>')

        r3 = self.client.patch(
            f'/api/boards/{self.board.id}/',
            {'library_sync_public_snapshot': True},
            format='json',
        )
        self.assertEqual(r3.status_code, 200)
        self.board.refresh_from_db()
        lib3 = self.client.get('/api/boards/library/').data
        entry3 = next(x for x in lib3 if x['id'] == str(self.board.id))
        self.assertEqual(entry3['html'], '<div>v2-privat</div>')
