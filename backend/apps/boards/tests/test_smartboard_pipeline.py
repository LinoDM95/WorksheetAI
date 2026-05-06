"""Tests für die Smartboard-Kreativmodus-Pipeline.

Fokus: reine Logik (Heuristiken, Aggregation, Mode-Dispatch). Provider-Calls werden
nicht ausgeführt — die Pipeline-Services müssen alle Heuristik-Pfade besitzen.
"""
from __future__ import annotations

from django.test import SimpleTestCase

from apps.boards.services.creative_brief import CreativeBriefService
from apps.boards.services.intent_router import IntentRouter
from apps.boards.services.quality_report import build_quality_report
from apps.boards.services.repair_agent import MODE_TO_PROMPT_KEY, RepairAgent
from apps.boards.services.risk_classifier import RiskClassifier
from apps.boards.services.snippet_library import get_relevant_snippets, render_snippets_for_prompt
from apps.boards.services.style_dna import StyleDNAService, VISUAL_METAPHOR_CATALOG
from apps.boards.services.touch_audit import _static_audit


class IntentRouterHeuristicTests(SimpleTestCase):
    def test_history_topic_classify_history_with_high_complexity(self):
        intent = IntentRouter().analyze({
            'subject': 'Sozialkunde', 'grade': 'Klasse 9', 'topic': 'Kalter Krieg',
            'prompt': 'Hotspots zu Grenzen Europa nach dem Zweiten Weltkrieg',
        })
        self.assertEqual(intent['subject_area'], 'history')
        self.assertEqual(intent['recommended_complexity'], 'high')
        self.assertEqual(intent['recommended_visual_direction'], 'historical_atlas')
        self.assertIn('factual_accuracy', intent['content_needs'])

    def test_math_drag_drop_primary_classifies_correctly(self):
        intent = IntentRouter().analyze({
            'subject': 'Addition', 'grade': 'Klasse 4 Grundschule', 'topic': 'Addition Aufgaben',
            'prompt': 'Zuordnungsspiel: Aufgabe und Lösung paaren',
        })
        self.assertEqual(intent['subject_area'], 'math')
        self.assertEqual(intent['grade_band'], 'primary')
        self.assertEqual(intent['board_kind'], 'drag_drop')
        self.assertIn('drag_drop', intent['interaction_needs'])
        self.assertIn('calculations', intent['content_needs'])

    def test_unknown_input_falls_back_general_with_unknown_grade(self):
        intent = IntentRouter().analyze({'prompt': 'Test'})
        self.assertEqual(intent['subject_area'], 'general')
        self.assertEqual(intent['grade_band'], 'unknown')


class RiskClassifierHeuristicTests(SimpleTestCase):
    def test_history_map_yields_schematic_strategy_with_warning(self):
        intent = {'subject_area': 'history', 'board_kind': 'map', 'interaction_needs': ['hotspots']}
        risk = RiskClassifier().classify({'topic': 'Karte 1949', 'prompt': 'Karte'}, intent)
        self.assertEqual(risk['recommended_generation_strategy'], 'schematic_with_warning')
        self.assertTrue(risk['should_warn_teacher'])
        self.assertGreater(len(risk['risks']), 0)
        types = {r['type'] for r in risk['risks']}
        self.assertIn('map_accuracy', types)

    def test_simulation_complex_high_risk_and_strategy(self):
        intent = {'subject_area': 'science', 'board_kind': 'simulation',
                  'interaction_needs': ['slider', 'hotspots', 'drag_drop']}
        risk = RiskClassifier().classify({'topic': 'Stromkreis-Simulation', 'prompt': 'Bauteile experimentieren'}, intent)
        self.assertIn(risk['overall_risk'], ('medium', 'high'))
        self.assertIn(risk['complexity'], ('medium', 'high'))
        types = {r['type'] for r in risk['risks']}
        self.assertIn('free_js_complexity', types)


class CreativeBriefHeuristicTests(SimpleTestCase):
    def test_brief_contains_didactic_flow_for_medium_complexity(self):
        intent = {'subject_area': 'math', 'recommended_complexity': 'medium',
                  'interaction_needs': ['drag_drop']}
        risk = {'risks': [], 'complexity': 'medium'}
        brief = CreativeBriefService().create(
            {'subject': 'Mathe', 'grade': '6', 'topic': 'Brüche', 'prompt': 'Zuordnungsspiel'}, intent, risk,
        )
        self.assertTrue(brief['board_goal'])
        self.assertTrue(brief['learning_goal'])
        self.assertGreaterEqual(len(brief['didactic_flow']), 2)
        self.assertIn('Reset-Button', brief['must_have'])


class StyleDNAHeuristicTests(SimpleTestCase):
    def test_dna_chooses_history_metaphor_and_palette(self):
        intent = {'subject_area': 'history', 'grade_band': 'lower_secondary', 'board_kind': 'map',
                  'interaction_needs': ['hotspots']}
        dna = StyleDNAService().create({'subject': 'Geschichte', 'grade': '9', 'topic': 'Kalter Krieg'},
                                        intent, {'risks': []}, {'board_goal': 'Karte verstehen'})
        self.assertEqual(dna['age_style'], 'secondary')
        catalog_metaphors = {m['metaphor'] for m in VISUAL_METAPHOR_CATALOG['history']}
        self.assertIn(dna['visual_metaphor'], catalog_metaphors)
        self.assertEqual(dna['interaction_style'], 'hotspot')
        self.assertTrue(dna['palette']['primary'].startswith('#'))

    def test_dna_primary_palette_friendly(self):
        intent = {'subject_area': 'primary', 'grade_band': 'primary', 'board_kind': 'mixed',
                  'interaction_needs': ['hotspots']}
        dna = StyleDNAService().create({'subject': 'Sachunterricht', 'grade': 'Klasse 2', 'topic': 'Tiere'},
                                        intent, {}, {})
        self.assertEqual(dna['age_style'], 'primary')
        self.assertEqual(dna['density'], 'low')
        self.assertEqual(dna['shape_language'], 'rounded')


class TouchAuditStaticTests(SimpleTestCase):
    def test_no_html_returns_failed(self):
        out = _static_audit('', '', threshold_px=56)
        self.assertFalse(out['passed'])
        self.assertEqual(out['element_count'], 0)

    def test_no_interactive_passes_with_warning(self):
        html = '<div class="free-board"><h1>Titel</h1><p>Text</p></div>'
        out = _static_audit(html, '', threshold_px=56)
        self.assertTrue(out['passed'])
        types = {i['type'] for i in out['issues']}
        self.assertIn('no_interactive', types)

    def test_small_buttons_in_css_flag_error(self):
        html = '<div class="free-board"><button>X</button></div>'
        css = 'button { min-width: 24px; min-height: 24px; }'
        out = _static_audit(html, css, threshold_px=56)
        self.assertFalse(out['passed'])
        types = {i['type'] for i in out['issues']}
        self.assertIn('small_touch_target', types)

    def test_hover_only_visibility_warns(self):
        html = '<div class="free-board"><button>Tap</button></div>'
        css = '.tooltip:hover { display: block; }'
        out = _static_audit(html, css, threshold_px=56)
        types = {i['type'] for i in out['issues']}
        self.assertIn('hover_only', types)


class QualityReportTests(SimpleTestCase):
    def test_clean_inputs_yield_passed_overall(self):
        report = build_quality_report(
            validation_errors=[], validation_warnings=[],
            browser_test_result={'ran': True, 'errors': [], 'warnings': []},
            touch_audit_result={'ran': True, 'passed': True, 'score': 95,
                                 'issues': [], 'element_count': 4},
            screenshot_quality_result={'ran': True, 'overall_score': 88,
                                         'scores': {}, 'issues': []},
            risk_analysis={'risks': []},
        )
        self.assertEqual(report['overall_status'], 'passed')
        self.assertGreaterEqual(report['overall_score'], 85)
        self.assertEqual(report['sections']['security']['status'], 'passed')

    def test_validation_errors_drop_security_score_to_failed(self):
        report = build_quality_report(
            validation_errors=['JavaScript enthält fetch()'],
            validation_warnings=[],
        )
        self.assertEqual(report['sections']['security']['status'], 'failed')
        self.assertEqual(report['overall_status'], 'failed')

    def test_touch_failures_lower_touch_section(self):
        report = build_quality_report(
            validation_errors=[], validation_warnings=[],
            touch_audit_result={'ran': True, 'passed': False, 'score': 40,
                                 'issues': [{'type': 'small_touch_target',
                                             'message': 'klein', 'severity': 'error', 'count': 5}],
                                 'element_count': 5},
        )
        self.assertEqual(report['sections']['touch']['status'], 'failed')
        self.assertIn('Touch verbessern (Touchflächen ≥ 56 px, Pointer-Events).',
                       report['suggested_next_actions'])


class SnippetLibraryTests(SimpleTestCase):
    def test_drag_drop_intent_returns_drag_pattern(self):
        intent = {'board_kind': 'drag_drop', 'interaction_needs': ['drag_drop']}
        snippets = get_relevant_snippets(intent, {})
        ids = {s['id'] for s in snippets}
        self.assertTrue(ids & {'drag_drop_cards_pointer_v1'})

    def test_render_snippets_returns_string_or_dash(self):
        text = render_snippets_for_prompt({'board_kind': 'mixed', 'interaction_needs': []}, {})
        self.assertIsInstance(text, str)


class RepairAgentDispatchTests(SimpleTestCase):
    def test_mode_to_prompt_key_covers_all_revision_modes(self):
        for mode in ('general', 'bug_fix', 'design_improve', 'touch_optimize',
                     'content_change', 'simplify', 'make_more_creative',
                     'performance_improve', 'security_fix', 'factual_warning'):
            self.assertIn(mode, MODE_TO_PROMPT_KEY)

    def test_needs_repair_logic(self):
        self.assertFalse(RepairAgent.needs_repair(
            validation_errors=[], touch_audit={'passed': True}, screenshot_quality=None,
        ))
        self.assertTrue(RepairAgent.needs_repair(
            validation_errors=['xyz'], touch_audit=None, screenshot_quality=None,
        ))
        self.assertTrue(RepairAgent.needs_repair(
            validation_errors=[], touch_audit={'passed': False}, screenshot_quality=None,
        ))
        self.assertTrue(RepairAgent.needs_repair(
            validation_errors=[], touch_audit={'passed': True},
            screenshot_quality={'overall_score': 40},
        ))
