"""Regression: Versionskopf bleibt mit Live-Stand synchron, wenn nur das Render-Modell neu aufgebaut wird."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.worksheets.models import Worksheet
from apps.worksheets.services.worksheet_revision_head import (
    create_initial_revision_if_absent,
    worksheet_matches_revision_head,
)


@override_settings(API_REQUIRE_AUTH=False)
class WorksheetPatchRevisionHeadTests(TestCase):
    def test_patch_records_revision_when_render_model_rebuilt_with_same_normalized_content(self) -> None:
        client = APIClient()
        User = get_user_model()
        user = User.objects.create_user('ws_rev_align', password='x')
        client.force_authenticate(user=user)
        content = {
            'title': 'Titel',
            'pages': [
                {
                    'page_label': '',
                    'blocks': [{'id': 'b1', 'type': 'text', 'title': 'A', 'content': 'X'}],
                },
            ],
        }
        rm_in = {
            'theme': 'neutral',
            'creativity': 'balanced',
            'show_sheet_header': True,
            'pages': [{'tasks': [], 'hints': [], 'solution': '', 'page_index': 0}],
        }
        ws = Worksheet.objects.create(
            owner=user,
            title='Titel',
            subject='Mathe',
            topic='Thema',
            content=content,
            render_model=rm_in,
        )
        create_initial_revision_if_absent(ws, user=user, prompt='(Historie)')
        ws.refresh_from_db()
        ws.render_model = {**rm_in, 'theme': 'bold'}
        ws.save(update_fields=['render_model'])
        ws.refresh_from_db()
        self.assertFalse(worksheet_matches_revision_head(ws))

        r = client.patch(f'/api/worksheets/{ws.id}/', {'content': content}, format='json')
        self.assertEqual(r.status_code, status.HTTP_200_OK, r.content)
        self.assertTrue(r.json().get('can_revise_with_ai', False))

        ws.refresh_from_db()
        self.assertTrue(worksheet_matches_revision_head(ws))
