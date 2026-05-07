"""CurriculumExtractionJob ViewSet."""
from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import decorators, response, status, viewsets

from apps.accounts.services.credits import enforce_positive_ai_credits_balance
from apps.curricula.models import CurriculumExtractionJob, CurriculumSource
from apps.curricula.serializers import (
    CurriculumApproveSerializer,
    CurriculumContextSerializer,
    CurriculumExtractionJobSerializer,
    CurriculumJobCreateSerializer,
    CurriculumRejectSerializer,
)
from apps.curricula.services.context_approval import CurriculumContextApprovalService
from apps.curricula.services.curriculum_ai_extraction import CurriculumAIExtractionService
from apps.curricula.views.permissions import STAFF_CURRICULA_PERMS


class CurriculumExtractionJobViewSet(viewsets.ModelViewSet):
    queryset = CurriculumExtractionJob.objects.select_related('source').all()
    serializer_class = CurriculumExtractionJobSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    permission_classes = STAFF_CURRICULA_PERMS

    def create(self, request, *args, **kwargs):
        ser = CurriculumJobCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        src = get_object_or_404(CurriculumSource, pk=data['source_id'])
        job = CurriculumExtractionJob.objects.create(
            source=src,
            state=data['state'],
            subject=data['subject'],
            grade_band=data['grade_band'],
            level_band=data.get('level_band') or [],
            topic_hint=data.get('topic_hint') or '',
            page_start=data.get('page_start'),
            page_end=data.get('page_end'),
            selected_pages=data.get('selected_pages') or [],
            status=CurriculumExtractionJob.STATUS_DRAFT,
            created_by=request.user if request.user.is_authenticated else None,
        )
        return response.Response(
            CurriculumExtractionJobSerializer(job).data,
            status=status.HTTP_201_CREATED,
        )

    @decorators.action(detail=True, methods=['post'], url_path='run')
    def run(self, request, pk=None):
        enforce_positive_ai_credits_balance(request.user)
        job = self.get_object()
        CurriculumAIExtractionService.extract_context(job)
        job.refresh_from_db()
        return response.Response(CurriculumExtractionJobSerializer(job).data)

    @decorators.action(detail=True, methods=['patch'], url_path='edit-extracted-context')
    def edit_extracted_context(self, request, pk=None):
        job = self.get_object()
        ctx = request.data.get('extracted_context')
        if not isinstance(ctx, dict):
            return response.Response({'detail': 'extracted_context muss ein Objekt sein.'}, status=400)
        job.extracted_context = ctx
        job.save(update_fields=['extracted_context', 'updated_at'])
        return response.Response(CurriculumExtractionJobSerializer(job).data)

    @decorators.action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        job = self.get_object()
        ser = CurriculumApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            ctx = CurriculumContextApprovalService.approve_job(
                job,
                edited_context=ser.validated_data.get('edited_context'),
                activate=ser.validated_data.get('activate', False),
                reviewer=request.user if request.user.is_authenticated else None,
            )
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=400)
        return response.Response(
            {
                'context': CurriculumContextSerializer(ctx).data,
                'job': CurriculumExtractionJobSerializer(job).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @decorators.action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        job = self.get_object()
        ser = CurriculumRejectSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        CurriculumContextApprovalService.reject_job(
            job,
            request.user if request.user.is_authenticated else None,
            ser.validated_data.get('notes') or '',
        )
        job.refresh_from_db()
        return response.Response(CurriculumExtractionJobSerializer(job).data)
