from rest_framework.routers import DefaultRouter
from .views import WorksheetViewSet
router=DefaultRouter(); router.register('', WorksheetViewSet, basename='worksheets')
urlpatterns=router.urls
