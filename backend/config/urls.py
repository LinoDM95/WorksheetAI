from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from apps.assets.views import AssetSvgView

from config.spa import spa_index_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/curriculum/', include('apps.curriculum.urls')),
    path('api/curricula/', include('apps.curricula.urls')),
    path('api/patterns/', include('apps.patterns.urls')),
    path('api/worksheets/', include('apps.worksheets.urls')),
    path('api/boards/', include('apps.boards.urls')),
    path('api/assets/', include('apps.assets.urls')),
    path('board-generated-assets/<uuid:asset_id>.svg', AssetSvgView.as_view(), name='asset-svg-serve'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif settings.SERVE_MEDIA_WITH_DJANGO:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]

if settings.SERVE_FRONTEND:
    urlpatterns += [
        re_path(
            r'^(?!api/|admin/|media/|static/|board-generated-assets).*$',
            spa_index_view,
        ),
    ]
