from rest_framework.routers import DefaultRouter
from .views import PatternViewSet
router=DefaultRouter(); router.register('', PatternViewSet, basename='patterns')
urlpatterns=router.urls
