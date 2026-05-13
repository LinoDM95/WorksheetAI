"""HTTP-Tests für Credit-Endpunkte (Liste, Checkout-Validierung, Webhook-Roundtrip)."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import CreditPackage, CreditPurchase, UserCreditBalance

User = get_user_model()


class CreditPackagesListEndpointTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='u@example.com',
            email='u@example.com',
            password='TestPass123!',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_get_returns_active_packages(self) -> None:
        r = self.client.get('/api/auth/credit-packages/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        data = r.json()
        self.assertIn('packages', data)
        slugs = {p['slug'] for p in data['packages']}
        self.assertIn('pack_1k', slugs)
        self.assertIn('pack_10k', slugs)

    def test_inactive_packages_are_hidden(self) -> None:
        CreditPackage.objects.filter(slug='pack_1k').update(is_active=False)
        r = self.client.get('/api/auth/credit-packages/')
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        slugs = {p['slug'] for p in r.json()['packages']}
        self.assertNotIn('pack_1k', slugs)

    def test_requires_authentication(self) -> None:
        anon = APIClient()
        r = anon.get('/api/auth/credit-packages/')
        self.assertEqual(r.status_code, status.HTTP_401_UNAUTHORIZED)


class CreditCheckoutEndpointTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='c@example.com',
            email='c@example.com',
            password='TestPass123!',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_invalid_slug_returns_400(self) -> None:
        with patch('apps.accounts.stripe_views.get_stripe_module', return_value=(object(), 'k')):
            r = self.client.post('/api/auth/stripe/credits-checkout/', {'package_slug': 'nope'}, format='json')
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_stripe_module_returns_503(self) -> None:
        with patch('apps.accounts.stripe_views.get_stripe_module', return_value=(None, None)):
            r = self.client.post(
                '/api/auth/stripe/credits-checkout/',
                {'package_slug': 'pack_1k'},
                format='json',
            )
        self.assertEqual(r.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_valid_slug_creates_pending_purchase_and_returns_url(self) -> None:
        fake_session = {'id': 'cs_test_xyz', 'url': 'https://checkout.stripe.com/abc'}

        class FakeCheckout:
            class Session:
                @staticmethod
                def create(**kwargs):
                    return fake_session

        class FakeMod:
            checkout = FakeCheckout

        with patch('apps.accounts.stripe_views.get_stripe_module', return_value=(FakeMod, 'k')):
            r = self.client.post(
                '/api/auth/stripe/credits-checkout/',
                {'package_slug': 'pack_1k'},
                format='json',
            )

        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.json()['url'], fake_session['url'])
        # Pending Purchase wurde angelegt
        purchase = CreditPurchase.objects.get(stripe_session_id='cs_test_xyz')
        self.assertEqual(purchase.user, self.user)
        self.assertEqual(purchase.status, CreditPurchase.Status.PENDING)
        self.assertEqual(purchase.credits, 1000)

    def test_subscription_plan_checkout_accepts_basic_5(self) -> None:
        # Smoke-Test: 5-€-Plan ist in der zulässigen Slug-Whitelist
        from apps.accounts.stripe_views import VALID_CHECKOUT_SLUGS

        self.assertIn('basic_5', VALID_CHECKOUT_SLUGS)


class CreditWebhookRoundtripTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='w@example.com',
            email='w@example.com',
            password='TestPass123!',
        )

    def test_webhook_grants_credits_on_payment_session_completed(self) -> None:
        from apps.accounts.services.credit_purchases import apply_credit_purchase_from_session

        bal_before = UserCreditBalance.objects.get(user=self.user).balance
        session = {
            'id': 'cs_test_w1',
            'mode': 'payment',
            'payment_status': 'paid',
            'amount_total': 1299,
            'currency': 'eur',
            'payment_intent': 'pi_w1',
            'metadata': {
                'purpose': 'credit_purchase',
                'user_id': str(self.user.pk),
                'package_slug': 'pack_10k',
                'credits': '10000',
            },
        }
        apply_credit_purchase_from_session(session)
        bal = UserCreditBalance.objects.get(user=self.user)
        self.assertEqual(bal.balance, bal_before + 10_000)
