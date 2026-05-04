from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/curriculum/', include('apps.curriculum.urls')),
    path('api/patterns/', include('apps.patterns.urls')),
    path('api/worksheets/', include('apps.worksheets.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
