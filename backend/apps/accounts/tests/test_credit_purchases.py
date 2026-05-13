"""Tests für einmalige Credit-Käufe (Stripe ``mode=payment``)."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import CreditPackage, CreditPurchase, UserCreditBalance
from apps.accounts.services.credit_purchases import (
    apply_credit_purchase_from_session,
    build_stripe_line_items,
    get_active_credit_package,
    list_active_credit_packages,
)

User = get_user_model()


def _session(
    *,
    session_id: str = 'cs_test_1',
    user_id: int,
    package_slug: str = 'pack_1k',
    credits: int = 1000,
    amount_total: int = 149,
    mode: str = 'payment',
    payment_status: str = 'paid',
    purpose: str = 'credit_purchase',
) -> dict:
    return {
        'id': session_id,
        'mode': mode,
        'payment_status': payment_status,
        'amount_total': amount_total,
        'currency': 'eur',
        'payment_intent': 'pi_test_1',
        'metadata': {
            'purpose': purpose,
            'user_id': str(user_id),
            'package_slug': package_slug,
            'credits': str(credits),
        },
    }


class CreditPackageQueryTests(TestCase):
    def test_seed_loaded(self) -> None:
        pkgs = list_active_credit_packages()
        slugs = {p['slug'] for p in pkgs}
        # 5 Seed-Pakete
        self.assertEqual(len(pkgs), 5)
        self.assertIn('pack_1k', slugs)
        self.assertIn('pack_10k', slugs)
        self.assertIn('pack_50k', slugs)

    def test_highlighted_package_present(self) -> None:
        pkgs = list_active_credit_packages()
        highlighted = [p for p in pkgs if p['highlighted']]
        self.assertEqual(len(highlighted), 1)
        self.assertEqual(highlighted[0]['slug'], 'pack_10k')

    def test_get_active_credit_package_inactive_returns_none(self) -> None:
        pkg = CreditPackage.objects.get(slug='pack_1k')
        pkg.is_active = False
        pkg.save(update_fields=['is_active'])
        self.assertIsNone(get_active_credit_package('pack_1k'))

    def test_build_stripe_line_items_uses_price_data_by_default(self) -> None:
        pkg = CreditPackage.objects.get(slug='pack_10k')
        items = build_stripe_line_items(pkg)
        self.assertEqual(len(items), 1)
        self.assertIn('price_data', items[0])
        self.assertEqual(items[0]['price_data']['unit_amount'], 1299)
        self.assertEqual(items[0]['quantity'], 1)

    def test_build_stripe_line_items_uses_stripe_price_id_when_set(self) -> None:
        pkg = CreditPackage.objects.get(slug='pack_10k')
        pkg.stripe_price_id = 'price_abc'
        pkg.save(update_fields=['stripe_price_id'])
        items = build_stripe_line_items(pkg)
        self.assertEqual(items[0], {'price': 'price_abc', 'quantity': 1})


class ApplyCreditPurchaseTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='buy@example.com',
            email='buy@example.com',
            password='TestPass123!',
        )

    def test_paid_session_grants_credits(self) -> None:
        bal_before = UserCreditBalance.objects.get(user=self.user).balance
        granted = apply_credit_purchase_from_session(
            _session(user_id=self.user.pk, package_slug='pack_1k', credits=1000)
        )
        self.assertEqual(granted, 1000)

        bal = UserCreditBalance.objects.get(user=self.user)
        self.assertEqual(bal.balance, bal_before + 1000)

        purchase = CreditPurchase.objects.get(stripe_session_id='cs_test_1')
        self.assertEqual(purchase.status, CreditPurchase.Status.PAID)
        self.assertEqual(purchase.user, self.user)
        self.assertEqual(purchase.credits, 1000)

    def test_replay_same_session_is_idempotent(self) -> None:
        s = _session(user_id=self.user.pk, package_slug='pack_1k', credits=1000)
        granted1 = apply_credit_purchase_from_session(s)
        granted2 = apply_credit_purchase_from_session(s)
        self.assertEqual(granted1, 1000)
        self.assertEqual(granted2, 0)
        bal = UserCreditBalance.objects.get(user=self.user)
        self.assertEqual(bal.balance, 1000)
        # Genau ein Purchase-Eintrag
        self.assertEqual(CreditPurchase.objects.filter(stripe_session_id='cs_test_1').count(), 1)

    def test_subscription_session_is_ignored(self) -> None:
        granted = apply_credit_purchase_from_session(
            _session(user_id=self.user.pk, mode='subscription')
        )
        self.assertEqual(granted, 0)
        self.assertFalse(CreditPurchase.objects.exists())

    def test_unpaid_session_is_ignored(self) -> None:
        granted = apply_credit_purchase_from_session(
            _session(user_id=self.user.pk, payment_status='unpaid')
        )
        self.assertEqual(granted, 0)
        self.assertFalse(CreditPurchase.objects.exists())

    def test_wrong_purpose_is_ignored(self) -> None:
        granted = apply_credit_purchase_from_session(
            _session(user_id=self.user.pk, purpose='other')
        )
        self.assertEqual(granted, 0)
        self.assertFalse(CreditPurchase.objects.exists())

    def test_missing_user_id_is_ignored(self) -> None:
        sess = _session(user_id=self.user.pk)
        sess['metadata']['user_id'] = 'not-an-int'
        granted = apply_credit_purchase_from_session(sess)
        self.assertEqual(granted, 0)
        self.assertFalse(CreditPurchase.objects.exists())

    def test_credits_from_metadata_when_no_package(self) -> None:
        # Paket-Slug ist da, aber das Paket existiert nicht → credits aus Metadata
        sess = _session(user_id=self.user.pk, package_slug='gone', credits=2222)
        granted = apply_credit_purchase_from_session(sess)
        self.assertEqual(granted, 2222)
        bal = UserCreditBalance.objects.get(user=self.user)
        self.assertEqual(bal.balance, 2222)
