from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.worksheets.models import Worksheet


@override_settings(API_REQUIRE_AUTH=False)
class WorksheetLibraryListingApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user('lib_ws_user', password='x')

    def test_publish_requires_listing_fields(self) -> None:
        self.client.force_authenticate(user=self.user)
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Privat',
            topic='Thema',
            content={'title': 'X', 'pages': []},
            render_model={'pages': []},
        )
        r = self.client.patch(
            f'/api/worksheets/{ws.id}/',
            {'library_public': True},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_teacher_submit_with_listing_sets_pending(self) -> None:
        self.client.force_authenticate(user=self.user)
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Privat',
            topic='Thema',
            content={'title': 'X', 'pages': []},
            render_model={'pages': []},
        )
        r = self.client.patch(
            f'/api/worksheets/{ws.id}/',
            {
                'library_public': True,
                'library_listing_title': 'Öffentlich',
                'library_listing_topic': 'ÖTopic',
                'library_listing_description': 'Beschreibung für die Bibliothek.',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.json()
        self.assertFalse(data['library_public'])
        self.assertEqual(data['library_moderation_status'], 'pending')
        self.assertEqual(data['library_listing_title'], 'Öffentlich')

    def test_staff_publish_sets_approved_and_public(self) -> None:
        User = get_user_model()
        staff = User.objects.create_user('staff_ws', password='x', is_staff=True)
        self.client.force_authenticate(user=staff)
        ws = Worksheet.objects.create(
            owner=staff,
            title='Privat',
            topic='Thema',
            content={'title': 'X', 'pages': []},
            render_model={'pages': []},
        )
        r = self.client.patch(
            f'/api/worksheets/{ws.id}/',
            {
                'library_public': True,
                'library_listing_title': 'Öffentlich',
                'library_listing_topic': 'ÖTopic',
                'library_listing_description': 'Beschreibung.',
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.json()
        self.assertTrue(data['library_public'])
        self.assertEqual(data['library_moderation_status'], 'approved')
        self.assertIsNotNone(data.get('library_snapshot_at'))

    def test_library_list_uses_listing_title(self) -> None:
        User = get_user_model()
        staff = User.objects.create_user('staff_ws2', password='x', is_staff=True)
        self.client.force_authenticate(user=staff)
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Privat',
            topic='Thema',
            content={'title': 'X', 'pages': []},
            render_model={'pages': []},
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
            library_listing_title='Katalogtitel',
            library_listing_topic='KTopic',
            library_listing_description='KDesc',
        )
        r = self.client.get('/api/worksheets/library/', {'scope': 'all'})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        rows = r.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], 'Katalogtitel')
        self.assertEqual(rows[0]['topic'], 'KTopic')
        self.assertEqual(rows[0]['description'], 'KDesc')

    def test_approved_live_edit_keeps_snapshot_until_staff_sync_or_reapprove(self) -> None:
        self.client.force_authenticate(user=self.user)
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Privat',
            subject='Bio',
            topic='Thema',
            content={'title': 'ORIGINAL', 'pages': []},
            render_model={'version': 'a', 'pages': [{'tasks': [], 'hints': [], 'solution': '', 'page_index': 0}]},
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
            library_listing_title='Listetitel',
            library_listing_topic='Listtopic',
            library_listing_description='ListeDesc',
            library_published_at=timezone.now(),
        )
        ws.library_snapshot_subject = ws.subject or ''
        ws.library_snapshot_grade = ws.grade
        ws.library_snapshot_topic = ws.topic or ''
        ws.library_snapshot_generation_meta = dict(ws.generation_meta) if ws.generation_meta else {}
        ws.library_snapshot_content = dict(ws.content) if ws.content else {}
        ws.library_snapshot_render_model = dict(ws.render_model) if ws.render_model else {}
        ws.library_snapshot_page_setup = dict(ws.page_setup) if ws.page_setup else {}
        ws.library_snapshot_at = timezone.now()
        ws.save()
        patch_url = f'/api/worksheets/{ws.id}/'

        teacher_client = APIClient()
        teacher_client.force_authenticate(user=self.user)
        r_t = teacher_client.patch(
            patch_url,
            {
                'content': {
                    'title': 'GEÄNDERT',
                    'pages': [],
                },
            },
            format='json',
        )
        self.assertEqual(r_t.status_code, status.HTTP_200_OK)

        detail = teacher_client.get(f'/api/worksheets/{ws.id}/library-entry/').json()
        self.assertEqual(detail['content'].get('title'), 'ORIGINAL')

        self.user.is_staff = True
        self.user.save(update_fields=['is_staff'])
        self.client.force_authenticate(user=self.user)
        rs = self.client.patch(
            patch_url,
            {'library_sync_public_snapshot': True},
            format='json',
        )
        self.assertEqual(rs.status_code, status.HTTP_200_OK)
        detail_after = teacher_client.get(f'/api/worksheets/{ws.id}/library-entry/').json()
        self.assertEqual(detail_after['content'].get('title'), 'GEÄNDERT')

    def test_non_staff_snapshot_sync_forbidden(self) -> None:
        self.client.force_authenticate(user=self.user)
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Privat',
            topic='Thema',
            content={'title': 'X', 'pages': []},
            render_model={'version': 'a', 'pages': [{'tasks': [], 'hints': [], 'solution': '', 'page_index': 0}]},
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
            library_listing_title='L',
            library_listing_topic='T',
            library_listing_description='D.',
            library_published_at=timezone.now(),
            library_snapshot_at=timezone.now(),
        )
        r = self.client.patch(
            f'/api/worksheets/{ws.id}/',
            {'library_sync_public_snapshot': True},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_snapshot_sync_requires_catalog_listed(self) -> None:
        User = get_user_model()
        staff = User.objects.create_user('staff_ws_syn2', password='x', is_staff=True)
        client = APIClient()
        client.force_authenticate(user=staff)
        ws = Worksheet.objects.create(
            owner=staff,
            title='Privat',
            topic='Thema',
            content={'title': 'X', 'pages': []},
            render_model={'version': 'a', 'pages': [{'tasks': [], 'hints': [], 'solution': '', 'page_index': 0}]},
        )
        r = client.patch(
            f'/api/worksheets/{ws.id}/',
            {'library_sync_public_snapshot': True},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
