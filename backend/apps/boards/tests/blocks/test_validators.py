"""Validator-Tests: CompositionPlan (Eingang) + CompositionSpec (intern)."""
from __future__ import annotations

from django.test import SimpleTestCase

from apps.boards.services.blocks.validators import (
    MAX_PAGES,
    PAGE_BLOCK_LIMIT,
    PAGE_UNIT_BUDGET,
    SpecValidationError,
    validate_plan,
    validate_spec,
)


# ---------------------------------------------------------------------------
# CompositionPlan (Wizard-Eingabe)
# ---------------------------------------------------------------------------
def _ok_plan() -> dict:
    return {
        'subject': 'Sachunterricht',
        'grade': '4',
        'topic': 'Wasserkreislauf',
        'title': 'Wasserkreislauf',
        'style_hint': 'freundlich, kindgerecht',
        'theme_id': 'science',
        'pages': [
            {
                'title': 'Einstieg',
                'bullets': ['Wasser verdunstet', 'Wolken bilden sich'],
                'block_slots': [
                    {'instance_id': 'a', 'block_id': 'textkarte', 'hint': ''},
                ],
            },
        ],
    }


class ValidatePlanHappyPathTests(SimpleTestCase):
    def test_minimal_plan_validates(self) -> None:
        plan = validate_plan(_ok_plan())
        self.assertEqual(len(plan.pages), 1)
        self.assertEqual(plan.pages[0].block_slots[0].block_id, 'textkarte')
        self.assertEqual(plan.pages[0].bullets[0], 'Wasser verdunstet')


class ValidatePlanErrorTests(SimpleTestCase):
    def test_no_pages(self) -> None:
        raw = _ok_plan()
        raw['pages'] = []
        with self.assertRaises(SpecValidationError):
            validate_plan(raw)

    def test_too_many_pages(self) -> None:
        raw = _ok_plan()
        raw['pages'] = [_ok_plan()['pages'][0]] * (MAX_PAGES + 1)
        with self.assertRaises(SpecValidationError) as cm:
            validate_plan(raw)
        self.assertTrue(any(str(MAX_PAGES) in e for e in cm.exception.errors))

    def test_too_many_slots_per_page(self) -> None:
        raw = _ok_plan()
        slot = _ok_plan()['pages'][0]['block_slots'][0]
        raw['pages'][0]['block_slots'] = [slot] * (PAGE_BLOCK_LIMIT + 1)
        with self.assertRaises(SpecValidationError) as cm:
            validate_plan(raw)
        self.assertTrue(any(str(PAGE_BLOCK_LIMIT) in e for e in cm.exception.errors))

    def test_unit_budget_exceeded(self) -> None:
        raw = _ok_plan()
        raw['pages'][0]['block_slots'] = [
            {'instance_id': f'x{i}', 'block_id': 'schritt', 'hint': ''}
            for i in range(4)
        ]
        with self.assertRaises(SpecValidationError) as cm:
            validate_plan(raw)
        self.assertTrue(any(str(PAGE_UNIT_BUDGET) in e for e in cm.exception.errors))

    def test_unknown_block_slot(self) -> None:
        raw = _ok_plan()
        raw['pages'][0]['block_slots'][0]['block_id'] = 'nope-block'
        with self.assertRaises(SpecValidationError) as cm:
            validate_plan(raw)
        self.assertTrue(any('unbekannter Baustein' in e for e in cm.exception.errors))

    def test_page_needs_bullets_or_global_topic(self) -> None:
        raw = _ok_plan()
        raw['topic'] = ''
        raw['title'] = ''
        raw['pages'][0]['bullets'] = []
        with self.assertRaises(SpecValidationError) as cm:
            validate_plan(raw)
        err = ' '.join(cm.exception.errors)
        self.assertIn('Titel', err)
        self.assertIn('Stichpunkt', err)

    def test_empty_title_rejected(self) -> None:
        raw = _ok_plan()
        raw['title'] = '   '
        with self.assertRaises(SpecValidationError) as cm:
            validate_plan(raw)
        self.assertTrue(any('Titel' in e for e in cm.exception.errors))

    def test_page_without_bullets_ok_when_global_topic_present(self) -> None:
        raw = _ok_plan()
        raw['pages'][0]['bullets'] = []
        plan = validate_plan(raw)
        self.assertEqual(plan.pages[0].bullets, [])

    def test_root_must_be_dict(self) -> None:
        with self.assertRaises(SpecValidationError):
            validate_plan([1, 2, 3])  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# CompositionSpec (intern, nach KI-Filling)
# ---------------------------------------------------------------------------
def _ok_spec() -> dict:
    return {
        'subject': 'Sachunterricht',
        'grade': '4',
        'topic': 'Wasserkreislauf',
        'title': 'Wasserkreislauf',
        'description': 'Board zu Verdunstung, Kondensation, Niederschlag.',
        'theme_id': 'science',
        'pages': [
            {
                'title': 'Einstieg',
                'blocks': [
                    {
                        'block_id': 'textkarte',
                        'content': {
                            'title': 'Was passiert?',
                            'body': 'Wasser verdunstet bei Sonneneinstrahlung.',
                            'merksatz': 'Sonne liefert die Energie.',
                        },
                    },
                ],
            },
        ],
    }


class ValidateSpecTests(SimpleTestCase):
    def test_minimal_spec_validates(self) -> None:
        spec = validate_spec(_ok_spec())
        self.assertEqual(len(spec.pages), 1)
        self.assertEqual(spec.pages[0].blocks[0].block_id, 'textkarte')

    def test_invalid_block_content(self) -> None:
        raw = _ok_spec()
        raw['pages'][0]['blocks'] = [
            {
                'block_id': 'multiple_choice',
                'content': {'question': 'Frage?', 'options': []},
            },
        ]
        with self.assertRaises(SpecValidationError):
            validate_spec(raw)
