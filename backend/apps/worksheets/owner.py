from django.conf import settings
from django.contrib.auth import get_user_model

LOCAL_DEV_USERNAME = '__local_dev__'


def resolve_worksheet_owner(user):
    """Echten Owner liefern oder bei API_REQUIRE_AUTH=False einen festen Dev-User."""
    if getattr(user, 'is_authenticated', False):
        return user
    if getattr(settings, 'API_REQUIRE_AUTH', True):
        raise ValueError('Authentifizierung erforderlich')
    User = get_user_model()
    dev, created = User.objects.get_or_create(
        username=LOCAL_DEV_USERNAME,
        defaults={'email': 'local-dev@worksheet.local', 'is_active': True},
    )
    if created:
        dev.set_unusable_password()
        dev.save()
    return dev
