from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=User)
def ensure_user_credit_balance(sender, instance: User, created: bool, **kwargs) -> None:
    if not created:
        return
    from apps.accounts.models import UserCreditBalance

    UserCreditBalance.objects.get_or_create(user=instance, defaults={'balance': 0})


@receiver(post_save, sender=User)
def ensure_user_subscription_row(sender, instance: User, created: bool, **kwargs) -> None:
    if not created:
        return
    from apps.accounts.services.subscription import ensure_user_subscription

    ensure_user_subscription(instance)


@receiver(post_save, sender=User)
def ensure_user_profile_row(sender, instance: User, created: bool, **kwargs) -> None:
    if not created:
        return
    from apps.accounts.models import UserProfile

    UserProfile.objects.get_or_create(user=instance, defaults={'is_demo': False})
