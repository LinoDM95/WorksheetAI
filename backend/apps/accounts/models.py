from django.conf import settings
from django.db import models


class UserCreditBalance(models.Model):
    """KI-Credits pro Nutzer (Abrechnung aus geschätzten Token-Kosten)."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='credit_balance',
    )
    balance = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Credit-Konto'
        verbose_name_plural = 'Credit-Konten'
