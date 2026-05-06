from django.conf import settings
from rest_framework_simplejwt.settings import api_settings


def _base_cookie_kwargs():
    secure = getattr(settings, 'JWT_AUTH_COOKIE_SECURE', not settings.DEBUG)
    samesite = getattr(settings, 'JWT_AUTH_COOKIE_SAMESITE', 'Lax')
    domain = getattr(settings, 'JWT_AUTH_COOKIE_DOMAIN', None)
    return {
        'httponly': getattr(settings, 'JWT_AUTH_COOKIE_HTTPONLY', True),
        'secure': secure,
        'samesite': samesite,
        'path': getattr(settings, 'JWT_AUTH_COOKIE_PATH', '/'),
        'domain': domain if domain else None,
    }


def set_auth_cookies(response, *, access=None, refresh=None):
    base = _base_cookie_kwargs()
    access_key = getattr(settings, 'JWT_AUTH_COOKIE_ACCESS', 'access')
    refresh_key = getattr(settings, 'JWT_AUTH_COOKIE_REFRESH', 'refresh')
    if access is not None:
        max_age = int(api_settings.ACCESS_TOKEN_LIFETIME.total_seconds())
        response.set_cookie(access_key, access, max_age=max_age, **base)
    if refresh is not None:
        max_age = int(api_settings.REFRESH_TOKEN_LIFETIME.total_seconds())
        response.set_cookie(refresh_key, refresh, max_age=max_age, **base)


def clear_auth_cookies(response):
    access_key = getattr(settings, 'JWT_AUTH_COOKIE_ACCESS', 'access')
    refresh_key = getattr(settings, 'JWT_AUTH_COOKIE_REFRESH', 'refresh')
    base = _base_cookie_kwargs()
    for key in (access_key, refresh_key):
        response.delete_cookie(key, path=base['path'], domain=base['domain'], samesite=base['samesite'])
