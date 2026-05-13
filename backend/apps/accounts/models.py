from django.conf import settings
from django.db import models


class SubscriptionPlan(models.Model):
    """Abo-Stufe mit monatlichem Credit-Kontingent (Vorbereitung für Stripe & Abo-Wechsel)."""

    slug = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    monthly_credit_grant = models.PositiveIntegerField(
        default=0,
        help_text='Credits, die pro Abrechnungsperiode gutgeschrieben werden (Free = 0).',
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    stripe_price_id = models.CharField(
        max_length=255,
        blank=True,
        help_text='Optional: Stripe Price ID bei Integration.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'slug']
        verbose_name = 'Abo-Plan'
        verbose_name_plural = 'Abo-Pläne'

    def __str__(self) -> str:
        return f'{self.name} ({self.slug})'


class UserSubscription(models.Model):
    """1:1 zum User; Quelle für wirksames Kontingent & später Stripe-IDs."""

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Aktiv'
        CANCELED = 'canceled', 'Gekündigt'
        PAST_DUE = 'past_due', 'Zahlung ausstehend'
        TRIALING = 'trialing', 'Testphase'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='subscription',
    )
    plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.PROTECT,
        related_name='subscriptions',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    stripe_customer_id = models.CharField(max_length=255, blank=True)
    stripe_subscription_id = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Nutzer-Abo'
        verbose_name_plural = 'Nutzer-Abos'

    def __str__(self) -> str:
        return f'{self.user_id} · {self.plan.slug} ({self.status})'


class UserProfile(models.Model):
    """Erweiterungen zum Django-User ohne Custom-User-Model.

    Demo-Konten (`is_demo`): begrenztes Credit-Guthaben, kein Stripe —
    Umwandlung in ein reguläres Konto über ``/api/auth/demo/finalize/``.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    is_demo = models.BooleanField(
        default=False,
        db_index=True,
        help_text='True: Demo-Zugang über Credit-Saldo, keine Zahlungen/Monatsgrants.',
    )
    demo_must_set_own_password = models.BooleanField(
        default=False,
        db_index=True,
        help_text='True: Demo-Login mit Gemeinschaftspasswort — zuerst eigenes Passwort per API/UI setzen.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Nutzerprofil'
        verbose_name_plural = 'Nutzerprofile'

    def __str__(self) -> str:
        return f'{self.user_id} · demo={self.is_demo}'


class UserCreditBalance(models.Model):
    """KI-Credits pro Nutzer (Abrechnung aus geschätzten Token-Kosten)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='credit_balance',
    )
    balance = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    last_monthly_grant_key = models.CharField(
        max_length=64,
        blank=True,
        help_text='Idempotenz für periodische Gutschriften (z. B. YYYY-MM oder Stripe invoice id).',
    )
    last_monthly_grant_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Credit-Konto'
        verbose_name_plural = 'Credit-Konten'


class CreditPackage(models.Model):
    """Einmalige Credit-Pakete (one-time purchase). 10k Credits ≙ 10 € + 30 % Marge ⇒ 13 €.

    Größere Pakete erhalten zusätzlich einen Mengenrabatt (psychologischer Upsell).
    """

    slug = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    credits = models.PositiveIntegerField()
    price_cents = models.PositiveIntegerField(help_text='Bruttopreis in Cent (z. B. 1299 = 12,99 €).')
    currency = models.CharField(max_length=3, default='eur')
    badge_label = models.CharField(
        max_length=32,
        blank=True,
        help_text='Optionales Label für die UI (z. B. "Beliebteste", "Bester Preis").',
    )
    highlighted = models.BooleanField(
        default=False,
        help_text='Visuelle Hervorhebung (gehighlighte Karte in der UI).',
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    stripe_price_id = models.CharField(
        max_length=255,
        blank=True,
        help_text='Optional: Stripe Price ID. Leer ⇒ Checkout nutzt price_data dynamisch.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'slug']
        verbose_name = 'Credit-Paket'
        verbose_name_plural = 'Credit-Pakete'

    def __str__(self) -> str:
        return f'{self.name} ({self.credits} Credits, {self.price_cents/100:.2f} {self.currency.upper()})'


class CreditPurchase(models.Model):
    """Audit-Log für einmalige Credit-Käufe (Stripe Checkout `mode=payment`).

    Sichert Idempotenz pro Stripe-Session und macht Käufe nachvollziehbar.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Offen'
        PAID = 'paid', 'Bezahlt'
        FAILED = 'failed', 'Fehlgeschlagen'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='credit_purchases',
    )
    package = models.ForeignKey(
        CreditPackage,
        on_delete=models.PROTECT,
        related_name='purchases',
        null=True,
        blank=True,
    )
    stripe_session_id = models.CharField(max_length=255, unique=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True)
    credits = models.PositiveIntegerField()
    price_cents = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default='eur')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Credit-Kauf'
        verbose_name_plural = 'Credit-Käufe'

    def __str__(self) -> str:
        return f'{self.user_id} · {self.credits} Credits · {self.status}'
