"""Einmalige Credit-Käufe (Stripe Checkout ``mode=payment``).

Trennt Domain-Logik (Pakete, Auflistung, Webhook-Anwendung) von Stripe-Aufrufen.
"""
from __future__ import annotations

import logging
from typing import Any, TypedDict

from django.db import transaction
from django.db.models import F

logger = logging.getLogger(__name__)


class CreditPackageDTO(TypedDict):
    slug: str
    name: str
    credits: int
    price_cents: int
    currency: str
    badge_label: str
    highlighted: bool


def list_active_credit_packages() -> list[CreditPackageDTO]:
    from apps.accounts.models import CreditPackage

    out: list[CreditPackageDTO] = []
    for p in CreditPackage.objects.filter(is_active=True).order_by('sort_order', 'slug'):
        out.append({
            'slug': p.slug,
            'name': p.name,
            'credits': int(p.credits),
            'price_cents': int(p.price_cents),
            'currency': str(p.currency or 'eur').lower(),
            'badge_label': p.badge_label or '',
            'highlighted': bool(p.highlighted),
        })
    return out


def get_active_credit_package(slug: str):
    from apps.accounts.models import CreditPackage

    if not slug:
        return None
    return CreditPackage.objects.filter(slug=slug, is_active=True).first()


def build_stripe_line_items(package) -> list[dict[str, Any]]:
    """Bevorzugt vor-definierte Stripe-Preise (falls gesetzt), sonst price_data dynamisch.

    `price_data` erlaubt das Anlegen neuer Pakete ohne Stripe-Setup.
    """
    if package.stripe_price_id:
        return [{'price': str(package.stripe_price_id), 'quantity': 1}]
    return [{
        'price_data': {
            'currency': str(package.currency or 'eur').lower(),
            'product_data': {
                'name': f'{int(package.credits):,} Credits ({package.name})'.replace(',', '.'),
                'metadata': {'package_slug': package.slug, 'credits': str(int(package.credits))},
            },
            'unit_amount': int(package.price_cents),
        },
        'quantity': 1,
    }]


def record_pending_purchase(*, user, package, stripe_session_id: str) -> None:
    from apps.accounts.models import CreditPurchase

    CreditPurchase.objects.get_or_create(
        stripe_session_id=stripe_session_id,
        defaults={
            'user': user,
            'package': package,
            'credits': int(package.credits),
            'price_cents': int(package.price_cents),
            'currency': str(package.currency or 'eur').lower(),
            'status': CreditPurchase.Status.PENDING,
        },
    )


def apply_credit_purchase_from_session(session_obj: dict[str, Any]) -> int:
    """Wird vom Stripe-Webhook beim ``checkout.session.completed`` (mode=payment) aufgerufen.

    Idempotent über ``CreditPurchase.stripe_session_id`` (unique). Gibt gebuchte Credits zurück.
    """
    from apps.accounts.models import CreditPackage, CreditPurchase, UserCreditBalance

    if not isinstance(session_obj, dict):
        return 0
    mode = str(session_obj.get('mode') or '')
    if mode != 'payment':
        return 0
    payment_status = str(session_obj.get('payment_status') or '').lower()
    if payment_status not in ('paid', 'no_payment_required'):
        return 0

    session_id = str(session_obj.get('id') or '')
    if not session_id:
        return 0

    metadata = session_obj.get('metadata') or {}
    purpose = str(metadata.get('purpose') or '')
    if purpose != 'credit_purchase':
        return 0

    user_id_raw = metadata.get('user_id')
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        logger.warning('Stripe credit purchase: invalid user_id metadata (session=%s)', session_id)
        return 0

    pkg_slug = str(metadata.get('package_slug') or '')
    package = CreditPackage.objects.filter(slug=pkg_slug).first() if pkg_slug else None

    credits = int(metadata.get('credits') or 0)
    if credits <= 0 and package:
        credits = int(package.credits)
    if credits <= 0:
        logger.warning('Stripe credit purchase: 0 credits (session=%s)', session_id)
        return 0

    amount_total = int(session_obj.get('amount_total') or (package.price_cents if package else 0) or 0)
    currency = str(session_obj.get('currency') or (package.currency if package else 'eur') or 'eur').lower()
    payment_intent = str(session_obj.get('payment_intent') or '')

    UserCreditBalance.objects.get_or_create(user_id=user_id, defaults={'balance': 0})

    with transaction.atomic():
        purchase, _ = CreditPurchase.objects.select_for_update().get_or_create(
            stripe_session_id=session_id,
            defaults={
                'user_id': user_id,
                'package': package,
                'credits': credits,
                'price_cents': amount_total,
                'currency': currency,
                'status': CreditPurchase.Status.PENDING,
                'stripe_payment_intent_id': payment_intent,
            },
        )
        if purchase.status == CreditPurchase.Status.PAID:
            return 0
        purchase.status = CreditPurchase.Status.PAID
        purchase.stripe_payment_intent_id = payment_intent or purchase.stripe_payment_intent_id
        purchase.save(update_fields=['status', 'stripe_payment_intent_id', 'updated_at'])

        UserCreditBalance.objects.filter(user_id=user_id).update(balance=F('balance') + credits)

    logger.info(
        '[CreditPurchase] user=%s session=%s credits=%s eur_cents=%s',
        user_id, session_id, credits, amount_total,
    )
    return credits
