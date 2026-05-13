from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import SubscriptionPlan, UserCreditBalance, UserSubscription
from apps.accounts.services.subscription import (
    effective_monthly_credit_grant,
    grant_monthly_credits,
    grant_monthly_credits_if_due,
)


User = get_user_model()


class SubscriptionDefaultsTests(TestCase):
    def test_new_user_free_plan_zero_balance(self) -> None:
        u = User.objects.create_user(
            username='free@example.com',
            email='free@example.com',
            password='TestPass123!',
        )
        sub = UserSubscription.objects.get(user=u)
        self.assertEqual(sub.plan.slug, 'free')
        self.assertEqual(sub.status, UserSubscription.Status.ACTIVE)
        bal = UserCreditBalance.objects.get(user=u)
        self.assertEqual(bal.balance, 0)
        self.assertEqual(effective_monthly_credit_grant(u), 0)

    def test_grant_monthly_idempotent(self) -> None:
        u = User.objects.create_user(
            username='paid@example.com',
            email='paid@example.com',
            password='TestPass123!',
        )
        pro = SubscriptionPlan.objects.get(slug='starter_10')
        sub = UserSubscription.objects.get(user=u)
        sub.plan = pro
        sub.save(update_fields=['plan'])
        n1 = grant_monthly_credits(u, grant_key='2026-05')
        self.assertGreater(n1, 0)
        bal = UserCreditBalance.objects.get(user=u)
        self.assertEqual(bal.balance, pro.monthly_credit_grant)
        n2 = grant_monthly_credits(u, grant_key='2026-05')
        self.assertEqual(n2, 0)
        bal.refresh_from_db()
        self.assertEqual(bal.balance, pro.monthly_credit_grant)

    def test_free_plan_second_grant_same_period_zero(self) -> None:
        u = User.objects.create_user(
            username='free2@example.com',
            email='free2@example.com',
            password='TestPass123!',
        )
        n = grant_monthly_credits(u, grant_key='2026-05')
        self.assertEqual(n, 0)


class BasicPlanTests(TestCase):
    def test_basic_5_plan_seeded(self) -> None:
        plan = SubscriptionPlan.objects.get(slug='basic_5')
        self.assertEqual(plan.monthly_credit_grant, 2500)
        self.assertTrue(plan.is_active)


class GrantMonthlyIfDueTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='active@example.com',
            email='active@example.com',
            password='TestPass123!',
        )
        plan = SubscriptionPlan.objects.get(slug='basic_5')
        sub = UserSubscription.objects.get(user=self.user)
        sub.plan = plan
        sub.status = UserSubscription.Status.ACTIVE
        sub.save(update_fields=['plan', 'status'])

    def test_first_call_grants_basic_credits(self) -> None:
        granted = grant_monthly_credits_if_due(self.user)
        self.assertEqual(granted, 2500)
        bal = UserCreditBalance.objects.get(user=self.user)
        self.assertEqual(bal.balance, 2500)
        self.assertIsNotNone(bal.last_monthly_grant_at)

    def test_second_call_same_month_is_no_op(self) -> None:
        grant_monthly_credits_if_due(self.user)
        granted_again = grant_monthly_credits_if_due(self.user)
        self.assertEqual(granted_again, 0)
        bal = UserCreditBalance.objects.get(user=self.user)
        self.assertEqual(bal.balance, 2500)

    def test_grants_again_in_new_month(self) -> None:
        grant_monthly_credits_if_due(self.user)
        # Letzte Buchung künstlich in den Vormonat schieben
        bal = UserCreditBalance.objects.get(user=self.user)
        bal.last_monthly_grant_at = timezone.now() - timedelta(days=45)
        bal.last_monthly_grant_key = '2026-03'
        bal.save(update_fields=['last_monthly_grant_at', 'last_monthly_grant_key'])

        granted = grant_monthly_credits_if_due(self.user)
        self.assertEqual(granted, 2500)
        bal.refresh_from_db()
        self.assertEqual(bal.balance, 5000)

    def test_free_plan_user_does_not_get_grant(self) -> None:
        u = User.objects.create_user(
            username='still-free@example.com',
            email='still-free@example.com',
            password='TestPass123!',
        )
        granted = grant_monthly_credits_if_due(u)
        self.assertEqual(granted, 0)
        bal = UserCreditBalance.objects.get(user=u)
        self.assertEqual(bal.balance, 0)

    def test_staff_user_does_not_get_grant(self) -> None:
        staff = User.objects.create_user(
            username='staff-grant@example.com',
            email='staff-grant@example.com',
            password='TestPass123!',
            is_staff=True,
        )
        granted = grant_monthly_credits_if_due(staff)
        self.assertEqual(granted, 0)

    def test_does_not_double_grant_after_webhook(self) -> None:
        # Simulation: Webhook hat eben gerade (gleicher Kalendermonat) Credits mit Invoice-Key gebucht.
        bal = UserCreditBalance.objects.get(user=self.user)
        bal.balance = 2500
        bal.last_monthly_grant_at = timezone.now()
        bal.last_monthly_grant_key = 'inv_xyz'
        bal.save(update_fields=['balance', 'last_monthly_grant_at', 'last_monthly_grant_key'])

        granted = grant_monthly_credits_if_due(self.user)
        self.assertEqual(granted, 0)
        bal.refresh_from_db()
        self.assertEqual(bal.balance, 2500)
