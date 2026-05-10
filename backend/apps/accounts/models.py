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
        max_length=32,
        blank=True,
        help_text='Idempotenz für periodische Gutschriften (z. B. YYYY-MM oder Stripe invoice id).',
    )
    last_monthly_grant_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Credit-Konto'
        verbose_name_plural = 'Credit-Konten'
