"""Stripe: Plans zuordnen, Nutzer-Abo aus Webhook/Subscription-Objekt aktualisieren."""
from __future__ import annotations

import logging
from datetime import datetime, timezone as dt_timezone
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q

logger = logging.getLogger(__name__)

User = get_user_model()


def plan_for_stripe_price_id(price_id: str):
    from apps.accounts.models import SubscriptionPlan

    if not price_id:
        return None
    plan = SubscriptionPlan.objects.filter(stripe_price_id=price_id, is_active=True).first()
    if plan:
        return plan
    slug = getattr(settings, 'STRIPE_PRICE_TO_PLAN_SLUG', {}).get(price_id)
    if slug:
        return SubscriptionPlan.objects.filter(slug=slug, is_active=True).first()
    return None


def resolve_stripe_price_id_for_plan_slug(plan_slug: str) -> str:
    from apps.accounts.models import SubscriptionPlan

    plan = SubscriptionPlan.objects.filter(slug=plan_slug, is_active=True).first()
    if plan and plan.stripe_price_id:
        return str(plan.stripe_price_id)
    if plan_slug == 'basic_5':
        return getattr(settings, 'STRIPE_PRICE_BASIC_5', '') or ''
    if plan_slug == 'starter_10':
        return getattr(settings, 'STRIPE_PRICE_STARTER_10', '') or ''
    if plan_slug == 'pro_20':
        return getattr(settings, 'STRIPE_PRICE_PRO_20', '') or ''
    return ''


def _monthly_grant_from_invoice(invoice_obj: dict[str, Any]) -> int | None:
    lines = (invoice_obj.get('lines') or {}).get('data') or []
    for line in lines:
        price = line.get('price') or {}
        pid = str(price.get('id') or '')
        if not pid and isinstance(line.get('plan'), dict):
            pid = str((line.get('plan') or {}).get('id') or '')
        pl = plan_for_stripe_price_id(pid)
        if pl and int(pl.monthly_credit_grant or 0) > 0:
            return int(pl.monthly_credit_grant)
    return None


def _ts_to_aware(ts: int | float | None):
    if ts is None:
        return None
    return datetime.fromtimestamp(float(ts), tz=dt_timezone.utc)


def get_stripe_module():
    import stripe

    key = getattr(settings, 'STRIPE_SECRET_KEY', '') or ''
    if not key:
        return None, None
    stripe.api_key = key
    return stripe, key


def apply_user_subscription_from_stripe(
    user_id: int,
    *,
    stripe_customer_id: str,
    stripe_subscription_id: str,
    stripe_subscription_obj: dict[str, Any],
) -> None:
    from apps.accounts.models import UserSubscription
    from apps.accounts.services.subscription import get_free_plan

    raw = str(stripe_subscription_obj.get('status') or '').lower()

    items = (stripe_subscription_obj or {}).get('items', {}) or {}
    data = items.get('data') or []
    price_id = ''
    if data:
        price_id = str((data[0].get('price') or {}).get('id') or '')
    plan = plan_for_stripe_price_id(price_id)

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning('Stripe sub: user %s not found', user_id)
        return

    sub_row, _ = UserSubscription.objects.get_or_create(
        user=user,
        defaults={'plan': get_free_plan(), 'status': UserSubscription.Status.ACTIVE},
    )

    if raw in ('canceled', 'unpaid', 'incomplete_expired'):
        free = get_free_plan()
        sub_row.plan_id = free.pk
        sub_row.status = UserSubscription.Status.ACTIVE
        sub_row.stripe_customer_id = ''
        sub_row.stripe_subscription_id = ''
        sub_row.current_period_start = None
        sub_row.current_period_end = None
        sub_row.save(
            update_fields=[
                'plan_id',
                'status',
                'stripe_customer_id',
                'stripe_subscription_id',
                'current_period_start',
                'current_period_end',
                'updated_at',
            ]
        )
        return

    cps = stripe_subscription_obj.get('current_period_start')
    cpe = stripe_subscription_obj.get('current_period_end')
    period_start = _ts_to_aware(cps) if cps else None
    period_end = _ts_to_aware(cpe) if cpe else None
    cust = str(stripe_customer_id or '')[:255]
    sub_id = str(stripe_subscription_id or '')[:255]

    if raw in ('active', 'trialing'):
        if plan is None:
            logger.warning('Stripe sub %s: unmapped price %s', stripe_subscription_id, price_id)
            return
        row_status = (
            UserSubscription.Status.TRIALING if raw == 'trialing' else UserSubscription.Status.ACTIVE
        )
    elif raw == 'past_due':
        if plan is None:
            logger.warning('Stripe sub %s: past_due but unmapped price %s', stripe_subscription_id, price_id)
            return
        row_status = UserSubscription.Status.PAST_DUE
    else:
        free = get_free_plan()
        sub_row.plan_id = free.pk
        sub_row.status = UserSubscription.Status.ACTIVE
        sub_row.stripe_customer_id = cust
        sub_row.stripe_subscription_id = sub_id
        sub_row.current_period_start = period_start
        sub_row.current_period_end = period_end
        sub_row.save(
            update_fields=[
                'plan_id',
                'status',
                'stripe_customer_id',
                'stripe_subscription_id',
                'current_period_start',
                'current_period_end',
                'updated_at',
            ]
        )
        return

    sub_row.plan_id = plan.pk
    sub_row.status = row_status
    sub_row.stripe_customer_id = cust
    sub_row.stripe_subscription_id = sub_id
    sub_row.current_period_start = period_start
    sub_row.current_period_end = period_end
    sub_row.save(
        update_fields=[
            'plan_id',
            'status',
            'stripe_customer_id',
            'stripe_subscription_id',
            'current_period_start',
            'current_period_end',
            'updated_at',
        ]
    )


def grant_invoice_credits_if_paid(invoice_obj: dict[str, Any]) -> None:
    from apps.accounts.models import UserSubscription
    from apps.accounts.services.subscription import grant_invoice_credits

    if not invoice_obj.get('paid'):
        return
    customer_id = str(invoice_obj.get('customer') or '')
    subscription_id = str(invoice_obj.get('subscription') or '')
    if not customer_id and not subscription_id:
        return

    q = Q()
    if customer_id:
        q |= Q(stripe_customer_id=customer_id)
    if subscription_id:
        q |= Q(stripe_subscription_id=subscription_id)
    sub_row = (
        UserSubscription.objects.select_related('user')
        .filter(q)
        .first()
    )
    if not sub_row or not sub_row.user_id:
        return
    inv_id = str(invoice_obj.get('id') or '')
    if not inv_id:
        return
    amount = _monthly_grant_from_invoice(invoice_obj)
    if not amount:
        return
    grant_invoice_credits(sub_row.user, grant_key=inv_id, amount=amount)
