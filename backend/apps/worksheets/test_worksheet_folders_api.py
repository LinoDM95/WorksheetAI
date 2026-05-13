from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.worksheets.models import Worksheet, WorksheetFolder


@override_settings(API_REQUIRE_AUTH=False)
class WorksheetFolderApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user('ws_folder_user', password='x')

    def test_create_list_folder(self) -> None:
        self.client.force_authenticate(user=self.user)
        r = self.client.post('/api/worksheets/folders/', {'name': 'Unterricht', 'parent': None}, format='json')
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        data = r.json()
        self.assertIn('id', data)
        self.assertEqual(data['name'], 'Unterricht')
        r2 = self.client.get('/api/worksheets/folders/')
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        rows = r2.json()
        rows = rows if isinstance(rows, list) else rows.get('results', [])
        self.assertEqual(len(rows), 1)

    def test_patch_worksheet_folder_id(self) -> None:
        self.client.force_authenticate(user=self.user)
        folder = WorksheetFolder.objects.create(owner=self.user, name='Ordner')
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Blatt',
            subject='Mathe',
            content={'title': 'B', 'pages': []},
            render_model={'pages': [{'id': 'p1'}]},
        )
        r = self.client.patch(
            f'/api/worksheets/{ws.id}/',
            {'folder_id': str(folder.id)},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json()['folder']['id'], str(folder.id))
        ws.refresh_from_db()
        self.assertEqual(ws.folder_id, folder.id)

    def test_duplicate_keeps_folder(self) -> None:
        self.client.force_authenticate(user=self.user)
        folder = WorksheetFolder.objects.create(owner=self.user, name='Ordner')
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Blatt',
            subject='Mathe',
            folder=folder,
            content={'title': 'B', 'pages': []},
            render_model={'pages': [{'id': 'p1'}]},
        )
        r = self.client.post(f'/api/worksheets/{ws.id}/duplicate/', {}, format='json')
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r.json()['folder']['id'], str(folder.id))
