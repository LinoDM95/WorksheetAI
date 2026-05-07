from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import UserCreditBalance
from apps.accounts.services.credits import (
    charge_ai_usage_usd_cents,
    enforce_positive_ai_credits_balance,
    usd_cents_to_credit_charge,
)


User = get_user_model()


class CreditsMathTests(TestCase):
    @override_settings(AI_COST_USD_TO_EUR=1.0, USER_CREDITS_PER_EUR=1000)
    def test_usd_cent_to_credits_one_euro(self) -> None:
        # 1 USD with FX=1 → ~1 EUR → 1000 credits (ceil)
        self.assertEqual(usd_cents_to_credit_charge(100), 1000)


class CreditsGateAndChargeTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='c@example.com',
            email='c@example.com',
            password='TestPass123!',
        )

    def test_enforce_blocks_at_zero_balance(self) -> None:
        ub = UserCreditBalance.objects.get(user=self.user)
        ub.balance = 0
        ub.save(update_fields=['balance'])
        with self.assertRaises(PermissionDenied):
            enforce_positive_ai_credits_balance(self.user)

    def test_staff_skips_enforce_and_charge(self) -> None:
        staff = User.objects.create_user(
            username='staff@example.com',
            email='staff@example.com',
            password='TestPass123!',
            is_staff=True,
        )
        ub = UserCreditBalance.objects.get(user=staff)
        ub.balance = 0
        ub.save(update_fields=['balance'])
        enforce_positive_ai_credits_balance(staff)
        charged = charge_ai_usage_usd_cents(staff, 10000)
        self.assertEqual(charged, 0)
        ub.refresh_from_db()
        self.assertEqual(ub.balance, 0)

    @override_settings(AI_COST_USD_TO_EUR=1.0, USER_CREDITS_PER_EUR=1000)
    def test_charge_allows_negative_balance(self) -> None:
        ub = UserCreditBalance.objects.get(user=self.user)
        ub.balance = 50
        ub.save(update_fields=['balance'])
        charged = charge_ai_usage_usd_cents(self.user, 100)
        self.assertGreater(charged, 0)
        ub.refresh_from_db()
        self.assertLess(ub.balance, 0)
