import logging

from django.conf import settings

from rest_framework import generics, permissions, status
from rest_framework.permissions import IsAuthenticated

from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .cookies import clear_auth_cookies, set_auth_cookies
from .services.password_reset import is_password_reset_request_throttled, send_password_reset_email
from .serializers import (
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    FinalizeDemoAccountSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
)

logger = logging.getLogger(__name__)


def _blacklist_all_refresh_tokens_for_user(user):
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer


class CookieTokenObtainPairView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code != status.HTTP_200_OK or not hasattr(response, 'data'):
            return response
        access = response.data.get('access')
        refresh = response.data.get('refresh')
        if not access or not refresh:
            return response
        set_auth_cookies(response, access=access, refresh=refresh)
        expose = getattr(settings, 'JWT_AUTH_EXPOSE_BODY_TOKENS', False)
        if not expose:
            response.data = {'detail': 'ok'}
        return response


class CookieTokenRefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_key = getattr(settings, 'JWT_AUTH_COOKIE_REFRESH', 'refresh')
        data = request.data.copy()
        if not data.get('refresh'):
            c = request.COOKIES.get(refresh_key)
            if c:
                data['refresh'] = c
        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])
        validated = serializer.validated_data
        response = Response({'detail': 'ok'}, status=status.HTTP_200_OK)
        set_auth_cookies(
            response,
            access=validated['access'],
            refresh=validated.get('refresh'),
        )
        return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        resp = Response({'detail': 'ok'}, status=status.HTTP_200_OK)
        clear_auth_cookies(resp)
        return resp


class FinalizeDemoAccountView(APIView):
    """Demo-Konto → reguläres Konto (gleiche User-ID, Arbeitsblätter/Boards bleiben)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.accounts.models import UserProfile
        from apps.accounts.services.demo_accounts import profile_is_demo

        if not profile_is_demo(request.user):
            return Response(
                {'detail': 'Dieses Konto ist kein Demo-Zugang.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = FinalizeDemoAccountSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        u = request.user
        data = ser.validated_data
        new_email = data['new_email']
        u.email = new_email
        u.username = new_email
        u.first_name = (data.get('first_name') or '').strip()
        u.last_name = (data.get('last_name') or '').strip()
        u.set_password(data['new_password'])
        u.save(update_fields=['email', 'username', 'first_name', 'last_name', 'password'])
        UserProfile.objects.filter(user_id=u.pk).update(
            is_demo=False,
            demo_must_set_own_password=False,
        )
        _blacklist_all_refresh_tokens_for_user(u)
        return Response(
            {
                'detail': (
                    'Dein eigenes Konto ist bereit. Bitte melde dich mit der neuen E-Mail-Adresse '
                    'und dem neuen Passwort erneut an — im nächsten Schritt wählst du dort einen '
                    'Plan oder lädst Credits auf.'
                ),
                'reauth_required': True,
            },
            status=status.HTTP_200_OK,
        )


class MeView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        from .services.subscription import grant_monthly_credits_if_due

        try:
            grant_monthly_credits_if_due(self.request.user)
        except Exception:
            logger.exception('grant_monthly_credits_if_due failed for user=%s', getattr(self.request.user, 'pk', None))
        return self.request.user


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.accounts.services.demo_accounts import profile_is_demo

        if profile_is_demo(request.user):
            return Response(
                {
                    'detail': (
                        'Demo-Konten können das Passwort hier nicht ändern. '
                        'Übernimm dein Konto unter Einstellungen (Abschnitt „Account übernehmen“) — '
                        'dort legst du E-Mail, Name und Passwort für dein dauerhaftes Konto fest.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = ChangePasswordSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        user = request.user
        user.set_password(ser.validated_data['new_password'])
        user.save()
        _blacklist_all_refresh_tokens_for_user(user)
        return Response({'detail': 'Dein Passwort wurde geändert.'}, status=status.HTTP_200_OK)


class ChangeEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from apps.accounts.services.demo_accounts import profile_is_demo

        if profile_is_demo(request.user):
            return Response(
                {
                    'detail': (
                        'Demo-Konten können die E-Mail hier nicht ändern. '
                        'Nutze den Abschnitt „Account übernehmen“ weiter oben auf dieser Seite.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = ChangeEmailSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        user = request.user
        new_email = ser.validated_data['new_email']
        user.email = new_email
        user.username = new_email
        user.save(update_fields=['email', 'username'])
        return Response({'detail': 'Deine E-Mail-Adresse wurde geändert.', 'email': new_email}, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if is_password_reset_request_throttled(request):
            return Response(
                {'detail': 'Zu viele Anfragen. Bitte versuche es später erneut.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        ser = PasswordResetRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            send_password_reset_email(request, ser.validated_data['email'])
        except Exception:
            logger.exception('password_reset email send failed')
            return Response(
                {
                    'detail': 'Die E-Mail konnte nicht versendet werden. Bitte versuche es später erneut.',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                'detail': (
                    'Wenn ein Konto mit dieser E-Mail existiert, haben wir dir '
                    'eine Nachricht mit einem Link zum Zurücksetzen gesendet.'
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        ser = PasswordResetConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data['user']
        user.set_password(ser.validated_data['password'])
        user.save()
        _blacklist_all_refresh_tokens_for_user(user)
        return Response(
            {'detail': 'Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.'},
            status=status.HTTP_200_OK,
        )
