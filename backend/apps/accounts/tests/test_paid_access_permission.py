from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import SubscriptionPlan, UserCreditBalance, UserProfile, UserSubscription

User = get_user_model()

_PAYWALLED_REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ('apps.accounts.authentication.CookieJWTAuthentication',),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
        'apps.accounts.permissions.HasActivePaidSubscription',
    ),
}


@override_settings(
    ROOT_URLCONF='config.urls',
    API_REQUIRE_AUTH=True,
    REST_FRAMEWORK=_PAYWALLED_REST_FRAMEWORK,
)
class PaidAccessPermissionTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_free_user_blocked_from_worksheet_list(self) -> None:
        u = User.objects.create_user(
            username='u1@example.com',
            email='u1@example.com',
            password='TestPass123!',
        )
        self.client.force_authenticate(user=u)
        r = self.client.get('/api/worksheets/')
        self.assertEqual(r.status_code, 403)

    def test_paid_user_can_list_worksheets(self) -> None:
        u = User.objects.create_user(
            username='u2@example.com',
            email='u2@example.com',
            password='TestPass123!',
        )
        plan = SubscriptionPlan.objects.get(slug='starter_10')
        sub = UserSubscription.objects.get(user=u)
        sub.plan = plan
        sub.status = UserSubscription.Status.ACTIVE
        sub.save(update_fields=['plan_id', 'status'])
        self.client.force_authenticate(user=u)
        r = self.client.get('/api/worksheets/')
        self.assertEqual(r.status_code, 200)

    def test_me_endpoint_allows_free_user(self) -> None:
        u = User.objects.create_user(
            username='u3@example.com',
            email='u3@example.com',
            password='TestPass123!',
        )
        self.client.force_authenticate(user=u)
        r = self.client.get('/api/auth/me/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data.get('has_platform_access'))

    def test_superuser_without_paid_plan_can_list_worksheets(self) -> None:
        u = User.objects.create_user(
            username='su@example.com',
            email='su@example.com',
            password='TestPass123!',
            is_superuser=True,
            is_staff=False,
        )
        self.client.force_authenticate(user=u)
        r = self.client.get('/api/worksheets/')
        self.assertEqual(r.status_code, 200)

    def test_demo_user_with_credits_can_list_worksheets(self) -> None:
        u = User.objects.create_user(
            username='demo-p@example.com',
            email='demo-p@example.com',
            password='TestPass123!',
        )
        UserProfile.objects.filter(user=u).update(is_demo=True)
        UserCreditBalance.objects.filter(user=u).update(balance=250)
        self.client.force_authenticate(user=u)
        r = self.client.get('/api/worksheets/')
        self.assertEqual(r.status_code, 200)
