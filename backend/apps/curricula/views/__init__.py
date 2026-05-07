"""DRF views for Curricula API (/api/curricula/).

Split by resource; public imports stay stable for urls.py.
"""
from apps.curricula.views.contexts import CurriculumContextViewSet
from apps.curricula.views.extraction_jobs import CurriculumExtractionJobViewSet
from apps.curricula.views.misc import CurriculumMatchView, CurriculumStateOptionsView
from apps.curricula.views.source import CurriculumSourceViewSet

__all__ = [
    'CurriculumContextViewSet',
    'CurriculumExtractionJobViewSet',
    'CurriculumMatchView',
    'CurriculumSourceViewSet',
    'CurriculumStateOptionsView',
]
