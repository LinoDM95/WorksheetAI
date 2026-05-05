from __future__ import annotations

from types import SimpleNamespace

from django.test import SimpleTestCase

from apps.worksheets.services.validators import validate_and_repair


class ValidateAndRepairTests(SimpleTestCase):
    def test_addition_repairs_answer_within_max(self) -> None:
        pattern = SimpleNamespace(
            blueprint={'generation_rules': {'operation': 'addition', 'max_result': 10}},
        )
        content = {
            'blocks': [
                {
                    'type': 'task_grid',
                    'items': [{'text': '2 + 3', 'label': 'A'}],
                },
            ],
        }
        out, errors = validate_and_repair(content, pattern)
        self.assertEqual(errors, [])
        self.assertEqual(out['blocks'][0]['items'][0]['answer'], 5)
        self.assertEqual(len(out['solutions']), 1)

    def test_addition_error_when_sum_exceeds_max(self) -> None:
        pattern = SimpleNamespace(
            blueprint={'generation_rules': {'operation': 'addition', 'max_result': 4}},
        )
        content = {
            'blocks': [
                {
                    'type': 'task_grid',
                    'items': [{'text': '3 + 3', 'label': 'A'}],
                },
            ],
        }
        _out, errors = validate_and_repair(content, pattern)
        self.assertTrue(any('Invalid addition result' in e for e in errors))

    def test_without_rules_no_errors(self) -> None:
        content = {'blocks': [{'type': 'task_grid', 'items': [{'text': '2 + 3'}]}]}
        out, errors = validate_and_repair(content, None)
        self.assertEqual(errors, [])
        self.assertIs(out, content)
