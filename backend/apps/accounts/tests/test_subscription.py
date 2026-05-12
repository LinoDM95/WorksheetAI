from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import SubscriptionPlan, UserCreditBalance, UserSubscription
from apps.accounts.services.subscription import (
    effective_monthly_credit_grant,
    grant_monthly_credits,
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
