from django.urls import path

from .views import CookieTokenObtainPairView, CookieTokenRefreshView, LogoutView, MeView, RegisterView

urlpatterns = [
    path('register/', RegisterView.as_view()),
    path('login/', CookieTokenObtainPairView.as_view()),
    path('logout/', LogoutView.as_view()),
    path('token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('me/', MeView.as_view()),
]
