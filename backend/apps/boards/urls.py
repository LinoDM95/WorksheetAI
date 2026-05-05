from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BoardFolderViewSet, BoardViewSet, PublicBoardPlayView

router = DefaultRouter()
router.register('folders', BoardFolderViewSet, basename='board-folder')
router.register(r'', BoardViewSet, basename='boards')

urlpatterns = [
    path('public-play/<str:share_token>/', PublicBoardPlayView.as_view(), name='board-public-play'),
] + router.urls
