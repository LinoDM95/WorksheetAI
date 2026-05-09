from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.worksheets.models import Worksheet
from apps.worksheets.services.worksheet_revision_head import create_initial_revision_if_absent


class CreateInitialRevisionTests(TestCase):
    def setUp(self) -> None:
        User = get_user_model()
        self.user = User.objects.create_user('ws_initial_rev', password='x')

    def test_initial_snapshot_mirrors_worksheet_state(self) -> None:
        content = {
            'title': 'Titel',
            'pages': [
                {'page_label': '', 'blocks': [{'id': 'b1', 'type': 'text', 'title': 'A', 'content': 'X'}]},
            ],
        }
        rm = {'pages': [{'id': 'rp1'}]}
        ws = Worksheet.objects.create(
            owner=self.user,
            title='Titel',
            subject='Mathe',
            content=content,
            render_model=rm,
        )
        rev = create_initial_revision_if_absent(ws, user=self.user, prompt='(Historie)')
        self.assertIsNotNone(rev)
        assert rev is not None
        self.assertEqual(rev.previous_content, rev.new_content)
        self.assertEqual(rev.previous_render_model, rev.new_render_model)
        self.assertEqual(rev.previous_metadata, rev.new_metadata)
        self.assertEqual(rev.new_content.get('title'), 'Titel')

    def test_skips_when_revisions_already_exist(self) -> None:
        ws = Worksheet.objects.create(
            owner=self.user,
            title='A',
            subject='B',
            content={'title': 'A', 'pages': []},
            render_model={'pages': []},
        )
        first = create_initial_revision_if_absent(ws, user=self.user, prompt='1')
        self.assertIsNotNone(first)
        second = create_initial_revision_if_absent(ws, user=self.user, prompt='2')
        self.assertIsNone(second)
        self.assertEqual(ws.revisions.count(), 1)
