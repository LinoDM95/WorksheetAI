import logging
from typing import Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger(__name__)

User = get_user_model()


def _client_ip(request) -> str:
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    if forwarded:
        return forwarded
    return request.META.get('REMOTE_ADDR', '') or 'unknown'


def is_password_reset_request_throttled(request) -> bool:
    """True = zu viele Anfragen von dieser IP (Schutz vor Missbrauch)."""
    max_r = int(getattr(settings, 'PASSWORD_RESET_MAX_PER_IP_PER_HOUR', 10))
    window = int(getattr(settings, 'PASSWORD_RESET_THROTTLE_WINDOW_SECONDS', 3600))
    ip = _client_ip(request)
    key = f'pwreset_req:{ip}'
    try:
        if cache.add(key, 1, timeout=window):
            return False
        n = cache.incr(key)
        return n > max_r
    except Exception:
        logger.exception('password_reset throttle cache error')
        return False


def _find_user_by_email(email: str) -> Optional[User]:
    normalized = (email or '').strip().lower()
    if not normalized:
        return None
    user = User.objects.filter(username__iexact=normalized).first()
    if user:
        return user
    return User.objects.filter(email__iexact=normalized).first()


def build_password_reset_link(user: User) -> str:
    base = getattr(settings, 'FRONTEND_PUBLIC_URL', 'http://localhost:5173').rstrip('/')
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f'{base}/passwort/zuruecksetzen?uid={uid}&token={token}'


def send_password_reset_email(request, email: str) -> None:
    """
    Sendet höchstens eine E-Mail, wenn ein passendes Konto existiert.
    Keine Rückgabe, ob die Adresse bekannt ist (Enumerationsschutz).
    """
    user = _find_user_by_email(email)
    if not user or not user.is_active:
        return
    reset_url = build_password_reset_link(user)
    ctx = {
        'user': user,
        'reset_url': reset_url,
        'site_name': getattr(settings, 'PASSWORD_RESET_EMAIL_SITE_NAME', 'WorksheetAI'),
    }
    subject = f'{ctx["site_name"]}: Passwort zurücksetzen'
    body_txt = render_to_string('accounts/email/password_reset.txt', ctx, request=request)
    body_html = render_to_string('accounts/email/password_reset.html', ctx, request=request)
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or 'webmaster@localhost'
    to = user.email or user.username
    msg = EmailMultiAlternatives(subject=subject, body=body_txt, from_email=from_email, to=[to])
    msg.attach_alternative(body_html, 'text/html')
    msg.send()
