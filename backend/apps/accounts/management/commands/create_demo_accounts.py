"""Demo-Nutzer für Live/Staging: Login-fähig, is_demo, fixes Credit-Guthaben, kein Stripe."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import UserCreditBalance, UserProfile

User = get_user_model()


class Command(BaseCommand):
    help = (
        'Erstellt Demo-Nutzer (is_demo=True) mit gemeinsamem Passwort und festem Credit-Guthaben. '
        'Nach Migration 0006_demo_passwortpflicht; nutze eine dedizierte Subdomain als E-Mail-Domain.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument('--count', type=int, default=20, help='Anzahl Konten (Standard: 20)')
        parser.add_argument(
            '--credits',
            type=int,
            default=None,
            help=f'Guthaben pro Konto (Standard: DEMO_ACCOUNT_CREDIT_CAP={getattr(settings, "DEMO_ACCOUNT_CREDIT_CAP", 10000)})',
        )
        parser.add_argument(
            '--domain',
            type=str,
            required=True,
            help='Domain ohne @, z. B. demo.deineapp.com',
        )
        parser.add_argument(
            '--prefix',
            type=str,
            default='demo',
            help='Lokaler Teil wird zu {prefix}-01@{domain} usw.',
        )
        parser.add_argument(
            '--password',
            type=str,
            required=True,
            help='Initialpasswort für alle Konten — Nutzer:innen müssen beim ersten Login ein eigenes Passwort setzen („Demo-Passwort“), bevor „Demo beenden“ greift.',
        )
        parser.add_argument('--dry-run', action='store_true', help='Nur anzeigen, keine DB-Änderung')

    def handle(self, *args, **options) -> None:
        count = int(options['count'])
        domain = str(options['domain']).strip().lstrip('@').lower()
        prefix = str(options['prefix']).strip().lower() or 'demo'
        password = options['password']
        dry = bool(options['dry_run'])
        cap = int(getattr(settings, 'DEMO_ACCOUNT_CREDIT_CAP', 10_000))
        credits = int(options['credits'] if options['credits'] is not None else cap)
        if credits < 0:
            raise CommandError('--credits muss >= 0 sein')
        if credits > cap:
            self.stdout.write(self.style.WARNING(f'Credits {credits} > DEMO_ACCOUNT_CREDIT_CAP {cap} — wird so gesetzt (nur dokumentarisch)'))

        if count < 1 or count > 500:
            raise CommandError('--count muss zwischen 1 und 500 liegen')

        planned: list[tuple[str, str]] = []
        for i in range(1, count + 1):
            local = f'{prefix}-{i:02d}'
            email = f'{local}@{domain}'
            planned.append((local, email))

        existing = []
        for _, email in planned:
            if User.objects.filter(username=email).exists():
                existing.append(email)
        if existing:
            raise CommandError(f'Nutzer existieren bereits: {", ".join(existing[:5])}{" …" if len(existing) > 5 else ""}')

        self.stdout.write(f'{count} Konten @{domain}, je {credits} Credits (Demo-Flag)\n')

        if dry:
            for _, email in planned:
                self.stdout.write(f'  [dry-run] would create {email}')
            return

        created_emails: list[str] = []
        for local, email in planned:
            with transaction.atomic():
                u = User.objects.create_user(username=email, email=email, password=password, first_name='', last_name='')
                UserProfile.objects.update_or_create(
                    user=u,
                    defaults={'is_demo': True, 'demo_must_set_own_password': False},
                )
                bc, _ = UserCreditBalance.objects.get_or_create(user=u, defaults={'balance': credits})
                if bc.balance != credits:
                    UserCreditBalance.objects.filter(pk=bc.pk).update(balance=credits)
            created_emails.append(email)

        self.stdout.write(self.style.SUCCESS(f'{len(created_emails)} Demo-Konten angelegt.'))
        for e in created_emails:
            self.stdout.write(f'  {e}')
