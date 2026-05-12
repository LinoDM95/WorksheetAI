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


class MeView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
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
