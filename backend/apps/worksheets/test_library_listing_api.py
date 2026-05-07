from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
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
