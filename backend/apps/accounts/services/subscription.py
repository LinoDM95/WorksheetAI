"""Abo- und Kontingent-Logik (Stripe-Anbindung kann hier einhängen)."""
from __future__ import annotations

from typing import Any, TypedDict

from django.db import transaction
from django.db.models import F
from django.utils import timezone

FREE_PLAN_SLUG = 'free'


class SubscriptionPayload(TypedDict):
    plan_slug: str
    plan_name: str
    monthly_credit_grant: int
    status: str
    has_platform_access: bool


def user_has_platform_access(user: Any) -> bool:
    """Staff und Superuser immer; sonst aktives Abo mit monatlichem Kontingent > 0 (kein Free-Tier)."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return True
    sub = get_user_subscription(user)
    if sub is None:
        return False
    if not subscription_grants_credits(sub):
        return False
    return int(sub.plan.monthly_credit_grant or 0) > 0


def get_free_plan():
    from apps.accounts.models import SubscriptionPlan

    return SubscriptionPlan.objects.get(slug=FREE_PLAN_SLUG)


def ensure_user_subscription(user: Any) -> None:
    """Idempotent: jeder User hat genau ein UserSubscription (Default: free)."""
    if user is None or not getattr(user, 'pk', None):
        return
    from apps.accounts.models import UserSubscription

    free = get_free_plan()
    UserSubscription.objects.get_or_create(user_id=user.pk, defaults={'plan': free, 'status': 'active'})


def get_user_subscription(user: Any):
    from apps.accounts.models import UserSubscription

    if user is None or not getattr(user, 'pk', None):
        return None
    sub = (
        UserSubscription.objects.select_related('plan')
        .filter(user_id=user.pk)
        .first()
    )
    if sub is None:
        ensure_user_subscription(user)
        sub = (
            UserSubscription.objects.select_related('plan')
            .filter(user_id=user.pk)
            .first()
        )
    return sub


def subscription_grants_credits(sub) -> bool:
    if sub is None:
        return False
    return sub.status in (
        sub.Status.ACTIVE,
        sub.Status.TRIALING,
    )


def effective_monthly_credit_grant(user: Any) -> int:
    """Monatliches Kontingent laut Plan (Free = 0). Bei inactivem Abo 0."""
    sub = get_user_subscription(user)
    if not subscription_grants_credits(sub):
        return 0
    return int(sub.plan.monthly_credit_grant or 0)


def get_subscription_api_payload(user: Any) -> SubscriptionPayload | None:
    sub = get_user_subscription(user)
    if sub is None:
        return None
    access = user_has_platform_access(user)
    return {
        'plan_slug': sub.plan.slug,
        'plan_name': sub.plan.name,
        'monthly_credit_grant': int(sub.plan.monthly_credit_grant or 0),
        'status': sub.status,
        'has_platform_access': access,
    }


def grant_monthly_credits(
    user: Any,
    *,
    grant_key: str,
    amount: int | None = None,
) -> int:
    """Idempotente Gutschrift (z. B. Webhook „invoice paid“ oder Cron).

    ``grant_key`` muss pro Periode eindeutig sein. Gibt gutgeschriebene Credits zurück (0 wenn schon gebucht).
    """
    from apps.accounts.models import UserCreditBalance
    from apps.accounts.services.credits import get_or_create_balance

    if user is None or not getattr(user, 'is_authenticated', False):
        return 0
    if getattr(user, 'is_staff', False):
        return 0
    if not grant_key or not str(grant_key).strip():
        return 0

    sub = get_user_subscription(user)
    if not subscription_grants_credits(sub):
        return 0

    credits_to_add = int(amount if amount is not None else sub.plan.monthly_credit_grant or 0)
    if credits_to_add <= 0:
        return 0

    get_or_create_balance(user)
    key = str(grant_key).strip()[:64]

    with transaction.atomic():
        acc = UserCreditBalance.objects.select_for_update().get(user=user)
        if acc.last_monthly_grant_key == key:
            return 0
        UserCreditBalance.objects.filter(pk=acc.pk).update(
            balance=F('balance') + credits_to_add,
            last_monthly_grant_key=key,
            last_monthly_grant_at=timezone.now(),
        )
    return credits_to_add


def grant_invoice_credits(user: Any, *, grant_key: str, amount: int) -> int:
    """Idempotente Gutschrift für ``invoice.paid`` (Betrag aus Rechnung). Ohne Abo-Status-Check."""
    from apps.accounts.models import UserCreditBalance
    from apps.accounts.services.credits import get_or_create_balance

    if user is None or not getattr(user, 'is_authenticated', False):
        return 0
    if getattr(user, 'is_staff', False):
        return 0
    if not grant_key or not str(grant_key).strip():
        return 0
    credits_to_add = int(amount)
    if credits_to_add <= 0:
        return 0

    get_or_create_balance(user)
    key = str(grant_key).strip()[:64]

    with transaction.atomic():
        acc = UserCreditBalance.objects.select_for_update().get(user=user)
        if acc.last_monthly_grant_key == key:
            return 0
        UserCreditBalance.objects.filter(pk=acc.pk).update(
            balance=F('balance') + credits_to_add,
            last_monthly_grant_key=key,
            last_monthly_grant_at=timezone.now(),
        )
    return credits_to_add
