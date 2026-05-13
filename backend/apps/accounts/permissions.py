from django.conf import settings
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated

from apps.accounts.services.demo_accounts import demo_must_set_own_password
from apps.accounts.services.subscription import user_has_platform_access

_DEMO_PASSWORD_PENDING_ALLOWED_PATHS = frozenset(
    {
        '/api/auth/me',
        '/api/auth/logout',
        '/api/auth/token/refresh',
        '/api/auth/demo/set-own-password',
    }
)


def _normalized_request_path(request) -> str:
    raw = getattr(request, 'path', '') or '/'
    p = raw.rstrip('/') or '/'
    return p


class DemoOwnPasswordGate(BasePermission):
    """Verhindert Zugriffe, solange Demo das Initial-Passwort noch ersetzen muss."""

    message = (
        'Bitte lege zuerst ein eigenes Passwort für dein Demo-Konto fest — '
        'danach hast du wieder vollen Zugriff.'
    )

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return True
        if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
            return True
        if not demo_must_set_own_password(user):
            return True
        return _normalized_request_path(request) in _DEMO_PASSWORD_PENDING_ALLOWED_PATHS


class APIPaywallMixin:
    """Liest API_REQUIRE_AUTH zur Request-Zeit.

    DRF setzt ``APIView.permission_classes`` beim ersten Import von ``rest_framework`` —
    bei lokal ``API_REQUIRE_AUTH=False`` wäre sonst ``AllowAny`` auf ViewSets „eingefroren“.
    """

    def get_permissions(self):
        if not getattr(settings, 'API_REQUIRE_AUTH', True):
            return [AllowAny()]
        return [IsAuthenticated(), DemoOwnPasswordGate(), HasActivePaidSubscription()]


class HasActivePaidSubscription(BasePermission):
    """API-Zugang nur mit aktivem Bezahl-Abo (Staff/Superuser ausgenommen)."""

    message = 'Aktives Abonnement erforderlich. Bitte unter Abonnement abschließen.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return True
        return user_has_platform_access(user)
