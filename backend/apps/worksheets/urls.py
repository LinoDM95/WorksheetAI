from rest_framework.routers import DefaultRouter
from .views import WorksheetFolderViewSet, WorksheetViewSet
router = DefaultRouter()
router.register('folders', WorksheetFolderViewSet, basename='worksheet-folder')
router.register('', WorksheetViewSet, basename='worksheets')
urlpatterns = router.urls
