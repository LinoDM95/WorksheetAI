from rest_framework import generics, permissions
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RegisterSerializer, UserSerializer

class RegisterView(generics.CreateAPIView):
    permission_classes=[permissions.AllowAny]
    serializer_class=RegisterSerializer

class LoginView(TokenObtainPairView):
    permission_classes=[permissions.AllowAny]

class MeView(generics.RetrieveAPIView):
    permission_classes=[IsAuthenticated]
    serializer_class=UserSerializer
    def get_object(self):
        return self.request.user
