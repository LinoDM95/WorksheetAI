"""Tests für die Asset-Engine — Pure-Logic-Pfade ohne AI-Provider."""

from __future__ import annotations

from django.contrib.auth.models import AnonymousUser, User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.boards.owner import LOCAL_DEV_USERNAME, resolve_board_owner

from apps.assets.models import (
    AssetGenerationJob,
    AssetPack,
    GeneratedAsset,
)
from apps.assets.services import asset_style
from apps.assets.services.asset_intent_classifier import AssetIntentClassifier
from apps.assets.services.asset_pack_consistency import evaluate_pack
from apps.assets.services.asset_planner import AssetPlanner
from apps.assets.services.asset_strategy_router import AssetStrategyRouter
from apps.assets.services.mascot_compiler import compile_mascot
from apps.assets.services.procedural_generators import GENERATORS, render
from apps.assets.services.scene_composer import compose as compose_scene
from apps.assets.services.svg_normalizer import normalize_svg
from apps.assets.services.svg_validation import validate_svg


class StyleFamilyTests(TestCase):
    def test_default_palette_returns_dict(self):
        self.assertIsInstance(asset_style.default_palette(), dict)

    def test_style_family_from_dna_falls_back_to_default(self):
        family = asset_style.style_family_from_dna({})
        valid_ids = {entry['id'] for entry in asset_style.list_style_families()}
        self.assertIn(family, valid_ids)

    def test_get_style_family_returns_none_for_unknown(self):
        self.assertIsNone(asset_style.get_style_family('does_not_exist_zzz'))


class ProceduralGeneratorTests(TestCase):
    def test_all_generators_produce_svg(self):
        for name, fn in GENERATORS.items():
            with self.subTest(name=name):
                result = fn(palette=asset_style.default_palette())
                self.assertIn('svg', result)
                self.assertTrue(result['svg'].lstrip().startswith('<svg'))
                self.assertGreaterEqual(int(result.get('width') or 0), 1)
                self.assertGreaterEqual(int(result.get('height') or 0), 1)

    def test_render_unknown_returns_none(self):
        self.assertIsNone(render('does_not_exist_zzz'))

    def test_render_via_alias(self):
        result = render('sonne')
        self.assertIsNotNone(result)
        self.assertIn('<svg', result['svg'])


class MascotCompilerTests(TestCase):
    def test_basic_mascot_emits_valid_svg(self):
        spec = {
            'species': 'bear',
            'pose': 'wave',
            'expression': 'happy',
            'palette': asset_style.default_palette(),
            'design_tokens': asset_style.default_design_tokens(),
        }
        result = compile_mascot(spec)
        self.assertIn('<svg', result['svg'])

    def test_unknown_species_falls_back_to_generic(self):
        result = compile_mascot({'species': 'unicorn_zzz'})
        self.assertIn('<svg', result['svg'])


class SvgValidationTests(TestCase):
    def test_clean_svg_passes(self):
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            '<title>OK</title><desc>desc</desc><circle cx="50" cy="50" r="20" fill="#abc"/>'
            '</svg>'
        )
        result = validate_svg(svg)
        self.assertTrue(result.ok, msg=result.errors)

    def test_script_blocked(self):
        result = validate_svg('<svg><script>alert(1)</script></svg>')
        self.assertFalse(result.ok)

    def test_foreign_object_blocked(self):
        result = validate_svg('<svg><foreignObject><div/></foreignObject></svg>')
        self.assertFalse(result.ok)

    def test_external_href_blocked(self):
        result = validate_svg('<svg><image href="https://x/y.png"/></svg>')
        self.assertFalse(result.ok)

    def test_event_handler_blocked(self):
        result = validate_svg('<svg><circle onclick="x()" /></svg>')
        self.assertFalse(result.ok)


class SvgNormalizerTests(TestCase):
    def test_strips_script_tags_and_keeps_basic_shape(self):
        svg = '<svg viewBox="0 0 50 50"><script>alert(1)</script><rect x="0" y="0" width="50" height="50"/></svg>'
        out = normalize_svg(svg)
        self.assertNotIn('<script', out.lower())
        self.assertIn('<rect', out.lower())

    def test_adds_xmlns_when_missing(self):
        svg = '<svg viewBox="0 0 10 10"><circle r="3"/></svg>'
        out = normalize_svg(svg)
        self.assertIn('xmlns', out)


class StrategyRouterTests(TestCase):
    def setUp(self):
        self.router = AssetStrategyRouter()

    def test_procedural_for_sun(self):
        decision = self.router.decide({'asset_type': 'icon', 'subject_text': 'sonne über haus'})
        self.assertIn(decision['strategy'], ('procedural', 'compiler', 'svg_free_draw'))

    def test_no_unsafe_override_for_map(self):
        decision = self.router.decide({'asset_type': 'map', 'subject_text': 'Karte Europa'})
        self.assertNotEqual(decision['strategy'], 'svg_free_draw')


class IntentClassifierTests(TestCase):
    def test_boring_diagram_no_custom_assets(self):
        result = AssetIntentClassifier().analyze(
            {'prompt': 'Sachliche Tabelle mit Diagramm und Kurve, nur Text.'},
        )
        self.assertFalse(result['needs_custom_assets'])

    def test_kid_friendly_with_mascot_needs_assets(self):
        result = AssetIntentClassifier().analyze(
            {'prompt': 'Bär und Hase auf einer Wiese, Sonne scheint, Wolken am Himmel.', 'grade': '2'},
        )
        self.assertTrue(result['needs_custom_assets'])
        self.assertGreaterEqual(result['estimated_asset_count'], 1)


class PlannerTests(TestCase):
    def test_plan_returns_assets_with_strategies(self):
        plan = AssetPlanner().plan(
            {'prompt': 'Bär, Sonne, Haus, Wiese.', 'topic': 'Bauernhof'},
            intent_classification={'needs_custom_assets': True},
        )
        self.assertIn('assets', plan)
        self.assertGreaterEqual(len(plan['assets']), 1)
        self.assertIn('style_family', plan)


class SceneComposerTests(TestCase):
    def test_compose_handles_empty_pack(self):
        user = User.objects.create_user(username='lehrer1', password='x')
        pack = AssetPack.objects.create(owner=user, name='Empty Pack')
        summary = compose_scene(pack)
        self.assertIsInstance(summary, dict)
        self.assertEqual(summary.get('assets', []), [])

    def test_compose_inline_for_small_svg(self):
        user = User.objects.create_user(username='lehrer2', password='x')
        pack = AssetPack.objects.create(owner=user, name='Test Pack', style_family='cute_round_mascot')
        small = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><circle r="20" cx="25" cy="25"/></svg>'
        GeneratedAsset.objects.create(
            asset_pack=pack, owner=user, key='ha',
            title='H', asset_type='icon', strategy='procedural',
            background_mode='transparent_cutout',
            normalized_svg=small, svg=small,
            width=50, height=50,
        )
        summary = compose_scene(pack)
        self.assertEqual(len(summary.get('assets') or []), 1)
        entry = summary['assets'][0]
        self.assertEqual(entry['delivery'], 'inline')
        self.assertIn('<svg', entry['inline_svg'])


class ConsistencyTests(TestCase):
    def test_evaluate_empty_pack(self):
        report = evaluate_pack([])
        self.assertIsInstance(report, dict)
        self.assertIn('score', report)

    def test_evaluate_one_asset_does_not_crash(self):
        report = evaluate_pack([
            {
                'svg': '<svg><circle r="10" fill="#000"/></svg>',
                'style_family': 'storybook_flat',
                'key': 'a',
            },
        ])
        self.assertIn('score', report)


@override_settings(API_REQUIRE_AUTH=False)
class AssetPackApiDevAuthTests(TestCase):
    """Parität zu Boards: ohne Login erreichbar, wenn API_REQUIRE_AUTH=False."""

    def setUp(self):
        self.client = APIClient()
        self.owner = resolve_board_owner(AnonymousUser())
        self.assertEqual(self.owner.username, LOCAL_DEV_USERNAME)

    def test_pack_list_without_jwt_returns_200_for_dev_owner(self):
        AssetPack.objects.create(owner=self.owner, name='Pack A')
        resp = self.client.get('/api/assets/packs/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertGreaterEqual(len(resp.data), 1)


class ModelConstraintTests(TestCase):
    def test_unique_key_per_pack(self):
        user = User.objects.create_user(username='lehrer4', password='x')
        pack = AssetPack.objects.create(owner=user, name='P')
        GeneratedAsset.objects.create(asset_pack=pack, owner=user, key='hero', title='Hero')
        with self.assertRaises(Exception):
            GeneratedAsset.objects.create(asset_pack=pack, owner=user, key='hero', title='Hero 2')

    def test_job_status_default(self):
        user = User.objects.create_user(username='lehrer5', password='x')
        pack = AssetPack.objects.create(owner=user, name='P')
        job = AssetGenerationJob.objects.create(asset_pack=pack, asset_key='hero')
        self.assertEqual(job.status, 'pending')
