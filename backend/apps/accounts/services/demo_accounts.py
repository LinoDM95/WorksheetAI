"""Demo-Konten: Profil-Flag, Zugriff über Credit-Saldo, kein Stripe / kein Monatsgrant."""
from __future__ import annotations

from typing import Any

from django.conf import settings


def demo_credit_cap() -> int:
    return max(0, int(getattr(settings, 'DEMO_ACCOUNT_CREDIT_CAP', 10_000)))


def profile_is_demo(user: Any) -> bool:
    if user is None or not getattr(user, 'pk', None):
        return False
    from apps.accounts.models import UserProfile

    return UserProfile.objects.filter(user_id=user.pk, is_demo=True).exists()


def demo_must_set_own_password(user: Any) -> bool:
    """True: Demo-Login noch mit Gemeinschaftspasswort — Plattformzugriff gesperrt bis eigenes Passwort gesetzt."""
    if user is None or not getattr(user, 'pk', None):
        return False
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return False
    from apps.accounts.models import UserProfile

    return UserProfile.objects.filter(
        user_id=user.pk,
        is_demo=True,
        demo_must_set_own_password=True,
    ).exists()


def is_demo_user_with_active_access(user: Any) -> bool:
    """Demo mit verbleibendem Guthaben (>0) — berechtigt zur Plattform wie bezahltes Kontingent."""
    if not profile_is_demo(user):
        return False
    from apps.accounts.services.credits import get_or_create_balance

    return int(get_or_create_balance(user).balance) > 0
