from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.worksheets.models import Worksheet, WorksheetRevision
from apps.worksheets.services.worksheet_revision_head import revision_revert_restore_bundle


class RevisionRevertBundleTests(TestCase):
    def test_legacy_initial_snapshot_maps_to_new_bundle(self) -> None:
        ws = Worksheet(title='T', subject='S', content={}, render_model={})
        rev = WorksheetRevision(
            worksheet=ws,
            prompt='x',
            previous_content={},
            previous_render_model={},
            previous_metadata={},
            new_content={'title': 'H', 'pages': [{'id': 'p1'}]},
            new_render_model={'pages': [{'id': 'r1'}]},
            new_metadata={'title': 'H', 'subject': 'S', 'topic': '', 'grade': 4},
        )
        pc, prm, pm = revision_revert_restore_bundle(rev)
        self.assertEqual(pc.get('title'), 'H')
        self.assertEqual(prm.get('pages'), [{'id': 'r1'}])
        self.assertEqual(pm.get('grade'), 4)

    def test_normal_revision_uses_previous(self) -> None:
        ws = Worksheet(title='T', subject='S', content={}, render_model={})
        rev = WorksheetRevision(
            worksheet=ws,
            prompt='x',
            previous_content={'title': 'Alt', 'pages': []},
            previous_render_model={'pages': []},
            previous_metadata={'title': 'Alt', 'subject': 'S', 'topic': '', 'grade': None},
            new_content={'title': 'Neu', 'pages': [{'id': 'n1'}]},
            new_render_model={'pages': [{'id': 'n2'}]},
            new_metadata={'title': 'Neu', 'subject': 'S', 'topic': '', 'grade': None},
        )
        pc, prm, pm = revision_revert_restore_bundle(rev)
        self.assertEqual(pc.get('title'), 'Alt')
        self.assertEqual(pm.get('title'), 'Alt')


@override_settings(API_REQUIRE_AUTH=False)
class WorksheetRevertRevisionApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user('ws_revert_test', password='x')

    def test_revert_legacy_only_revision_keeps_content(self) -> None:
        self.client.force_authenticate(user=self.user)
        content = {
            'title': 'Behalten',
            'pages': [
                {
                    'page_label': '',
                    'blocks': [{'id': 'b1', 'type': 'text', 'title': 'A', 'content': 'X'}],
                },
            ],
        }
        rm = {'pages': [{'id': 'rp1'}]}
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Behalten',
            subject='Mathe',
            content=content,
            render_model=rm,
        )
        rev = WorksheetRevision.objects.create(
            worksheet=ws,
            prompt='(Historie)',
            revision_mode='general',
            previous_content={},
            previous_render_model={},
            previous_metadata={},
            new_content=content,
            new_render_model=rm,
            new_metadata={'title': 'Behalten', 'subject': 'Mathe', 'topic': '', 'grade': None},
            ai_raw_output={'source': 'initial_snapshot'},
        )
        r = self.client.post(
            f'/api/worksheets/{ws.id}/revert-revision/',
            {'revision_id': str(rev.id)},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        ws.refresh_from_db()
        self.assertEqual(ws.content.get('title'), 'Behalten')
        self.assertEqual(len(ws.content.get('pages', [])), 1)
        self.assertFalse(ws.revisions.exists())
