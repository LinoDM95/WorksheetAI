from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .cookies import clear_auth_cookies, set_auth_cookies
from .serializers import RegisterSerializer, UserSerializer


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
