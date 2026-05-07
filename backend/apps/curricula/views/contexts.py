"""CurriculumContext ViewSet (list/filter approved contexts, activate/archive)."""
from __future__ import annotations

from rest_framework import decorators, response, viewsets

from apps.curricula.models import CurriculumContext
from apps.curricula.serializers import CurriculumContextSerializer
from apps.curricula.views.permissions import STAFF_CURRICULA_PERMS


class CurriculumContextViewSet(viewsets.ModelViewSet):
    queryset = CurriculumContext.objects.select_related('source').all()
    serializer_class = CurriculumContextSerializer
    http_method_names = ['get', 'patch', 'head', 'options']
    permission_classes = STAFF_CURRICULA_PERMS

    def get_queryset(self):
        qs = super().get_queryset()
        st = self.request.query_params.get('state')
        sub = self.request.query_params.get('subject')
        gb = self.request.query_params.get('grade_band')
        stat = self.request.query_params.get('status')
        if st:
            qs = qs.filter(state__iexact=st.strip())
        if sub:
            qs = qs.filter(subject__icontains=sub.strip())
        if gb:
            qs = qs.filter(grade_band__iexact=gb.strip())
        if stat:
            qs = qs.filter(status=stat.strip())
        return qs

    @decorators.action(detail=True, methods=['post'], url_path='activate')
    def activate(self, request, pk=None):
        ctx = self.get_object()
        ctx.status = CurriculumContext.STATUS_ACTIVE
        ctx.save(update_fields=['status', 'updated_at'])
        return response.Response(CurriculumContextSerializer(ctx).data)

    @decorators.action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        ctx = self.get_object()
        ctx.status = CurriculumContext.STATUS_ARCHIVED
        ctx.save(update_fields=['status', 'updated_at'])
        return response.Response(CurriculumContextSerializer(ctx).data)
