"""Cron-Backstop: monatliche Credit-Gutschriften für aktive Abos.

Idempotent pro Kalendermonat — kann täglich laufen (siehe ``grant_monthly_credits_if_due``).
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.accounts.services.subscription import grant_monthly_credits_if_due

User = get_user_model()


class Command(BaseCommand):
    help = 'Gewährt monatliche Credits für alle aktiven Abos (idempotent pro Kalendermonat).'

    def handle(self, *args, **options):
        granted_users = 0
        granted_credits = 0
        for u in User.objects.filter(is_active=True, is_staff=False).iterator():
            n = grant_monthly_credits_if_due(u)
            if n > 0:
                granted_users += 1
                granted_credits += n
        self.stdout.write(self.style.SUCCESS(
            f'Monatliche Gutschriften: {granted_users} Nutzer · {granted_credits} Credits.'
        ))
