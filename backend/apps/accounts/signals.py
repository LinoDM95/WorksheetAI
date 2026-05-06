from django.conf import settings
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=User)
def ensure_user_credit_balance(sender, instance: User, created: bool, **kwargs) -> None:
    if not created:
        return
    from apps.accounts.models import UserCreditBalance

    initial = int(getattr(settings, 'USER_CREDITS_INITIAL_BALANCE', 10000))
    UserCreditBalance.objects.get_or_create(user=instance, defaults={'balance': initial})
