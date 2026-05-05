from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.curricula.views import (
    CurriculumContextViewSet,
    CurriculumExtractionJobViewSet,
    CurriculumMatchView,
    CurriculumSourceViewSet,
    CurriculumStateOptionsView,
)

router = DefaultRouter()
router.register('sources', CurriculumSourceViewSet, basename='curriculum-sources')
router.register('extraction-jobs', CurriculumExtractionJobViewSet, basename='curriculum-jobs')
router.register('contexts', CurriculumContextViewSet, basename='curriculum-contexts')

urlpatterns = [
    path('state-options/', CurriculumStateOptionsView.as_view(), name='curriculum-state-options'),
    path('match/', CurriculumMatchView.as_view(), name='curriculum-match'),
    path('', include(router.urls)),
]
