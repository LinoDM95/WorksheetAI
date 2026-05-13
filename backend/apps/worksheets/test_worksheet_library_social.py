from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.worksheets.models import Worksheet, WorksheetLibraryComment, WorksheetRating


@override_settings(API_REQUIRE_AUTH=False)
class WorksheetLibrarySocialApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.owner = User.objects.create_user('ws_lib_owner', password='x')
        self.other = User.objects.create_user('ws_lib_other', password='x')
        self.ws = Worksheet.objects.create(
            owner=self.owner,
            title='Privat',
            topic='Thema',
            content={'title': 'Öffentlich', 'pages': []},
            render_model={'pages': []},
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
            library_listing_title='Katalogtitel',
            library_listing_topic='KTopic',
            library_listing_description='KD',
        )

    def test_library_list_includes_rating_aggregates(self) -> None:
        WorksheetRating.objects.create(worksheet=self.ws, user=self.other, stars=5)
        WorksheetLibraryComment.objects.create(worksheet=self.ws, user=self.other, body='Nice')
        self.client.force_authenticate(user=self.other)
        r = self.client.get('/api/worksheets/library/', {'scope': 'all'})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        rows = r.json()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['rating_count'], 1)
        self.assertEqual(row['comment_count'], 1)
        self.assertIsNotNone(row['avg_rating'])
        self.assertEqual(row['my_stars'], 5)

    def test_library_entry_contains_preview_payload(self) -> None:
        self.client.force_authenticate(user=self.other)
        r = self.client.get(f'/api/worksheets/{self.ws.id}/library-entry/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.json()
        self.assertEqual(data['title'], 'Katalogtitel')
        self.assertIn('content', data)
        self.assertIn('render_model', data)
        self.assertIn('page_setup', data)

    def test_rate_updates_aggregate(self) -> None:
        self.client.force_authenticate(user=self.other)
        r = self.client.post(f'/api/worksheets/{self.ws.id}/rate/', {'stars': 4}, format='json')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        d = r.json()
        self.assertEqual(d['stars'], 4)
        self.assertEqual(d['rating_count'], 1)
        self.assertEqual(d['avg_rating'], 4.0)

    def test_adopt_creates_owned_clone(self) -> None:
        self.client.force_authenticate(user=self.other)
        r = self.client.post(f'/api/worksheets/{self.ws.id}/adopt-from-library/', {}, format='json')
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        data = r.json()
        self.assertEqual(data['viewer_is_owner'], True)
        cid = data['id']
        clone = Worksheet.objects.filter(pk=cid).first()
        assert clone is not None
        self.assertEqual(clone.owner_id, self.other.id)
        self.assertEqual(clone.library_public, False)
        self.assertEqual(clone.source_worksheet_id, self.ws.id)

    def test_library_comments_flow(self) -> None:
        r_list = self.client.get(f'/api/worksheets/{self.ws.id}/library-comments/')
        self.assertEqual(r_list.status_code, status.HTTP_200_OK)
        self.assertEqual(r_list.json(), [])

        self.client.force_authenticate(user=self.other)
        r_post = self.client.post(
            f'/api/worksheets/{self.ws.id}/library-comments/',
            {'text': '  Hallo Kollegium  '},
            format='json',
        )
        self.assertEqual(r_post.status_code, status.HTTP_201_CREATED)
        r2 = self.client.get(f'/api/worksheets/{self.ws.id}/library-comments/')
        self.assertEqual(len(r2.json()), 1)
        self.assertEqual(r2.json()[0]['text'], 'Hallo Kollegium')
