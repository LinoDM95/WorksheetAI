from django.conf import settings
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated

from apps.accounts.services.subscription import user_has_platform_access


class APIPaywallMixin:
    """Liest API_REQUIRE_AUTH zur Request-Zeit.

    DRF setzt ``APIView.permission_classes`` beim ersten Import von ``rest_framework`` —
    bei lokal ``API_REQUIRE_AUTH=False`` wäre sonst ``AllowAny`` auf ViewSets „eingefroren“.
    """

    def get_permissions(self):
        if not getattr(settings, 'API_REQUIRE_AUTH', True):
            return [AllowAny()]
        return [IsAuthenticated(), HasActivePaidSubscription()]


class HasActivePaidSubscription(BasePermission):
    """API-Zugang nur mit aktivem Bezahl-Abo (Staff/Superuser ausgenommen)."""

    message = 'Aktives Abonnement erforderlich. Bitte unter Abonnement abschließen.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return True
        return user_has_platform_access(user)
