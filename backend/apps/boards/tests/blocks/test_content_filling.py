"""KI-Filling: Plan -> Spec mit deterministischer Heuristik (Mock-Provider)."""
from __future__ import annotations

from django.test import SimpleTestCase, override_settings

from apps.boards.services.blocks.content_filling import fill_plan_with_ai
from apps.boards.services.blocks.validators import validate_plan


def _plan(slots: list[dict], bullets: list[str] | None = None) -> dict:
    return {
        'subject': 'Sachunterricht',
        'grade': '4',
        'topic': 'Wasserkreislauf',
        'title': 'Wasserkreislauf',
        'style_hint': '',
        'theme_id': 'science',
        'pages': [
            {
                'title': 'Seite 1',
                'bullets': bullets or ['Wasser verdunstet', 'Wolken bilden sich', 'Es regnet'],
                'block_slots': slots,
            },
        ],
    }


@override_settings(AI_PROVIDER='mock')
class FillPlanWithAiTests(SimpleTestCase):
    def test_textkarte_filled_from_bullets(self) -> None:
        plan = validate_plan(_plan([
            {'instance_id': 'a', 'block_id': 'textkarte', 'hint': 'Merksatz: Sonne ist der Motor.'},
        ]))
        spec, _notes = fill_plan_with_ai(plan)
        block = spec.pages[0].blocks[0]
        self.assertEqual(block.block_id, 'textkarte')
        self.assertIn('Wasser', block.content['title'])
        self.assertIn('Sonne', block.content.get('merksatz', ''))

    def test_multiple_choice_has_two_options_min(self) -> None:
        plan = validate_plan(_plan(
            [{'instance_id': 'q', 'block_id': 'multiple_choice', 'hint': ''}],
            bullets=['Was ist 2+2?', '4', '5'],
        ))
        spec, _ = fill_plan_with_ai(plan)
        opts = spec.pages[0].blocks[0].content['options']
        self.assertGreaterEqual(len(opts), 2)
        self.assertTrue(opts[0]['correct'])

    def test_balken_chart_has_entries(self) -> None:
        plan = validate_plan(_plan(
            [{'instance_id': 'c', 'block_id': 'balken_chart', 'hint': ''}],
            bullets=['Klassenumfrage', 'Mathe 8', 'Deutsch 4', 'Sport 12'],
        ))
        spec, _ = fill_plan_with_ai(plan)
        entries = spec.pages[0].blocks[0].content['entries']
        self.assertGreaterEqual(len(entries), 2)

    def test_lueckentext_creates_at_least_one_sentence(self) -> None:
        plan = validate_plan(_plan(
            [{'instance_id': 'l', 'block_id': 'lueckentext', 'hint': ''}],
            bullets=['Setze die Wörter ein', 'Die Sonne scheint hell.'],
        ))
        spec, _ = fill_plan_with_ai(plan)
        sentences = spec.pages[0].blocks[0].content['sentences']
        self.assertGreaterEqual(len(sentences), 1)
        self.assertIn('___', sentences[0]['text'])

    def test_multiple_slots_all_filled(self) -> None:
        plan = validate_plan(_plan([
            {'instance_id': 'a', 'block_id': 'textkarte', 'hint': ''},
            {'instance_id': 'b', 'block_id': 'aufdeckkarte', 'hint': ''},
        ]))
        spec, _ = fill_plan_with_ai(plan)
        ids = [b.instance_id for b in spec.pages[0].blocks]
        self.assertEqual(ids, ['a', 'b'])
        self.assertTrue(spec.pages[0].blocks[0].content['title'])
        self.assertTrue(spec.pages[0].blocks[1].content['front'])


@override_settings(AI_PROVIDER='mock')
class NormalizeProviderBlockFillTests(SimpleTestCase):
    def test_slot_contents_array_maps_by_instance_id(self) -> None:
        from apps.boards.services.blocks.content_filling import _normalize_provider_block_fill

        raw = {
            'slot_contents': [
                {'instance_id': 'a', 'content': {'title': 'A', 'body': 'b', 'merksatz': ''}},
                {'instance_id': 'b', 'content': {'front': 'f', 'back': 'x', 'hint': ''}},
            ],
        }
        self.assertEqual(
            _normalize_provider_block_fill(raw),
            {
                'a': {'title': 'A', 'body': 'b', 'merksatz': ''},
                'b': {'front': 'f', 'back': 'x', 'hint': ''},
            },
        )

    def test_flat_map_fallback(self) -> None:
        from apps.boards.services.blocks.content_filling import _normalize_provider_block_fill

        raw = {'x1': {'foo': 1}, 'slot_contents': []}
        self.assertEqual(_normalize_provider_block_fill(raw), {'x1': {'foo': 1}})
