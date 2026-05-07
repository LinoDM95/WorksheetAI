from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.worksheets.models import Worksheet


@override_settings(API_REQUIRE_AUTH=False)
class WorksheetDuplicateApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user('dup_ws_user', password='x')

    def test_duplicate_creates_clone_and_resets_library(self) -> None:
        self.client.force_authenticate(user=self.user)
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Mein Blatt',
            subject='Mathe',
            content={'title': 'X', 'pages': [{'id': 'p1'}]},
            render_model={'pages': []},
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
        )
        r = self.client.post(f'/api/worksheets/{ws.id}/duplicate/', {}, format='json')
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        data = r.json()
        self.assertNotEqual(str(data['id']), str(ws.id))
        self.assertTrue(str(data['title']).endswith('(Kopie)'))
        self.assertEqual(data['subject'], 'Mathe')
        self.assertFalse(data['library_public'])
        self.assertEqual(data['library_moderation_status'], 'none')
        self.assertEqual(data.get('library_listing_title') or '', '')
        self.assertEqual(data.get('library_listing_topic') or '', '')
        self.assertEqual(data.get('library_listing_description') or '', '')
        clone = Worksheet.objects.get(pk=data['id'])
        self.assertEqual(clone.content['pages'][0]['id'], 'p1')
