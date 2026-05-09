from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.worksheets.models import Worksheet


@override_settings(API_REQUIRE_AUTH=False, AI_PROVIDER='mock')
class WorksheetRegeneratePagesApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user('ws_reg_pages', password='x')

    def test_regenerate_two_pages_via_bulk_endpoint(self) -> None:
        self.client.force_authenticate(user=self.user)
        content = {
            'title': 'Demo',
            'pages': [
                {
                    'page_label': '',
                    'blocks': [
                        {'id': 'b1', 'type': 'text', 'title': 'Aufgabe 1', 'content': 'Eins.'},
                    ],
                },
                {
                    'page_label': '',
                    'blocks': [
                        {'id': 'b2', 'type': 'text', 'title': 'Aufgabe 2', 'content': 'Zwei.'},
                    ],
                },
            ],
        }
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Bulk',
            subject='Mathe',
            content=content,
            render_model={'pages': []},
        )
        r = self.client.post(
            f'/api/worksheets/{ws.id}/regenerate-pages/',
            {
                'teacher_instruction': 'Bitte konsistenter formulieren.',
                'content': content,
                'page_indices': [0, 1],
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.json()
        pages = data['content']['pages']
        self.assertEqual(len(pages), 2)
        self.assertGreaterEqual(len(pages[0].get('blocks') or []), 2)
        self.assertGreaterEqual(len(pages[1].get('blocks') or []), 2)

    def test_empty_page_indices_returns_400(self) -> None:
        self.client.force_authenticate(user=self.user)
        ws = Worksheet.objects.create(
            owner=self.user,
            title='X',
            subject='Bio',
            content={
                'title': 'Y',
                'pages': [
                    {'page_label': '', 'blocks': [{'id': 'z', 'type': 'text', 'title': '', 'content': '?'}]},
                ],
            },
            render_model={'pages': []},
        )
        r = self.client.post(
            f'/api/worksheets/{ws.id}/regenerate-pages/',
            {'teacher_instruction': 'x', 'content': ws.content, 'page_indices': []},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)


@override_settings(API_REQUIRE_AUTH=False, AI_PROVIDER='mock')
class WorksheetRegeneratePageStructureTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user('ws_reg_struct', password='x')

    def test_regenerate_inserts_page_when_instruction_asks_mock(self) -> None:
        self.client.force_authenticate(user=self.user)
        content = {
            'title': 'Demo',
            'pages': [
                {
                    'page_label': '',
                    'blocks': [
                        {'id': 'b1', 'type': 'text', 'title': 'Aufgabe 1', 'content': 'Eins.'},
                    ],
                },
            ],
        }
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Struct',
            subject='Mathe',
            content=content,
            render_model={'pages': []},
        )
        r = self.client.post(
            f'/api/worksheets/{ws.id}/regenerate-page/',
            {
                'teacher_instruction': 'Bitte füge eine neue Seite hinzu.',
                'content': content,
                'page_index': 0,
            },
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        pages = r.json()['content']['pages']
        self.assertEqual(len(pages), 2)
        self.assertEqual(pages[0]['blocks'][0]['id'], 'b1')

