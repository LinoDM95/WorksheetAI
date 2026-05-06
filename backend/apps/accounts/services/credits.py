"""Credits: USD-Schätzung (aus Tokenpreisen) → EUR → interne Credits.

10000 Credits = 10 EUR ⇒ 1000 Credits / EUR.
"""
from __future__ import annotations

import logging
import math
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import F

logger = logging.getLogger(__name__)


def credits_per_eur() -> int:
    return max(1, int(getattr(settings, 'USER_CREDITS_PER_EUR', 1000)))


def usd_cents_to_credit_charge(usd_cents: int) -> int:
    """Schätzung in USD-Cents (wie ``estimate_cost_cents``) → abzurechnende Credits."""
    fx = float(getattr(settings, 'AI_COST_USD_TO_EUR', 0.92))
    usd = max(0, int(usd_cents)) / 100.0
    eur = usd * fx
    if eur <= 0:
        return 0
    cpe = credits_per_eur()
    return max(1, math.ceil(eur * cpe - 1e-12))


def get_or_create_balance(user: Any):
    from apps.accounts.models import UserCreditBalance

    initial = int(getattr(settings, 'USER_CREDITS_INITIAL_BALANCE', 10000))
    obj, _ = UserCreditBalance.objects.get_or_create(user=user, defaults={'balance': initial})
    return obj


def enforce_positive_ai_credits_balance(user: Any | None) -> None:
    """Neue KI-Sessions nur mit Balance > 0; ein laufender Durchlauf darf ins Minus (Abrechnung am Ende)."""
    if not getattr(settings, 'AI_CREDITS_ENABLED', True):
        return
    if user is None or not getattr(user, 'is_authenticated', False):
        return
    bal = get_or_create_balance(user)
    if bal.balance <= 0:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied(
            detail='Keine Credits mehr. Bitte aufladen — der letzte KI-Lauf wurde noch zu Ende geführt.',
            code='insufficient_credits',
        )


def charge_ai_usage_usd_cents(user: Any | None, usd_cents: int) -> int:
    """Zieht Credits vom Konto; erlaubt negatives Saldo (Nachzahlung nach Überziehung). Returns Credits."""
    if not getattr(settings, 'AI_CREDITS_ENABLED', True):
        return 0
    if user is None or not getattr(user, 'is_authenticated', False):
        return 0
    credits = usd_cents_to_credit_charge(usd_cents)
    if credits <= 0:
        return 0
    get_or_create_balance(user)
    with transaction.atomic():
        from apps.accounts.models import UserCreditBalance

        acc = UserCreditBalance.objects.select_for_update().get(user=user)
        UserCreditBalance.objects.filter(pk=acc.pk).update(balance=F('balance') - credits)
    logger.info('[Credits] user=%s charged=%s (usd_cents_est=%s)', user.pk, credits, usd_cents)
    return credits
