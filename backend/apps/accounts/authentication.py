from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    """JWT aus Authorization: Bearer … oder aus HttpOnly-Cookie (access)."""

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw = self.get_raw_token(header)
            if raw is None:
                return None
            validated = self.get_validated_token(raw)
            return self.get_user(validated), validated
        cookie_key = getattr(settings, 'JWT_AUTH_COOKIE_ACCESS', 'access')
        raw = request.COOKIES.get(cookie_key)
        if not raw:
            return None
        validated = self.get_validated_token(raw)
        return self.get_user(validated), validated
