"""CurriculumSource ViewSet (PDF sources, auto-extract, page text)."""
from __future__ import annotations

import uuid

from rest_framework import decorators, response, status, viewsets

from apps.accounts.services.credits import enforce_positive_ai_credits_balance
from apps.curricula.models import CurriculumExtractionJob, CurriculumSource
from apps.curricula.serializers import (
    CurriculumAutoApproveSerializer,
    CurriculumAutoExtractRequestSerializer,
    CurriculumExtractionJobSerializer,
    CurriculumSourceCreateSerializer,
    CurriculumSourceSerializer,
)
from apps.curricula.services.auto_discovery import CurriculumAutoDiscoveryService
from apps.curricula.services.auto_extraction import CurriculumAutoExtractionService
from apps.curricula.services.context_approval import CurriculumContextApprovalService
from apps.curricula.services.pdf_extraction import CurriculumPDFExtractionService
from apps.curricula.views.permissions import STAFF_CURRICULA_PERMS


class CurriculumSourceViewSet(viewsets.ModelViewSet):
    queryset = CurriculumSource.objects.all()
    permission_classes = STAFF_CURRICULA_PERMS

    def get_serializer_class(self):
        if self.action == 'create':
            return CurriculumSourceCreateSerializer
        return CurriculumSourceSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return response.Response(
            CurriculumSourceSerializer(serializer.instance, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    def perform_create(self, serializer):
        serializer.save()

    @decorators.action(detail=True, methods=['post'], url_path='extract-text')
    def extract_text(self, request, pk=None):
        source = self.get_object()
        CurriculumPDFExtractionService.extract_source(source)
        source.refresh_from_db()
        return response.Response(CurriculumSourceSerializer(source).data)

    @decorators.action(detail=True, methods=['get'], url_path='pages')
    def pages(self, request, pk=None):
        source = self.get_object()
        ps = request.query_params.get('page_start')
        pe = request.query_params.get('page_end')
        rows = list(source.extracted_pages or [])
        if ps is not None:
            try:
                lo = int(ps)
                rows = [r for r in rows if isinstance(r, dict) and int(r.get('page') or 0) >= lo]
            except ValueError:
                pass
        if pe is not None:
            try:
                hi = int(pe)
                rows = [r for r in rows if isinstance(r, dict) and int(r.get('page') or 0) <= hi]
            except ValueError:
                pass
        out = []
        for r in rows:
            if not isinstance(r, dict):
                continue
            out.append(
                {
                    'page': r.get('page'),
                    'char_count': r.get('char_count'),
                    'preview_text': r.get('preview_text'),
                    'has_text': r.get('has_text'),
                },
            )
        return response.Response({'pages': out})

    @decorators.action(detail=True, methods=['post'], url_path='auto-discover')
    def auto_discover(self, request, pk=None):
        enforce_positive_ai_credits_balance(request.user)
        source = self.get_object()
        if source.extraction_status != CurriculumSource.EXTRACTION_DONE:
            CurriculumPDFExtractionService.extract_source(source)
            source.refresh_from_db()
        result = CurriculumAutoDiscoveryService.run(source)
        source.refresh_from_db()
        data = CurriculumSourceSerializer(source).data
        data['discovery_result'] = result
        return response.Response(data)

    @decorators.action(detail=True, methods=['post'], url_path='auto-extract')
    def auto_extract(self, request, pk=None):
        enforce_positive_ai_credits_balance(request.user)
        source = self.get_object()
        ser = CurriculumAutoExtractRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        result = CurriculumAutoExtractionService.run(
            source,
            selected_indices=ser.validated_data.get('selected_indices') or None,
            user=request.user if request.user.is_authenticated else None,
        )
        source.refresh_from_db()
        return response.Response(
            {
                'source': CurriculumSourceSerializer(source).data,
                'run': result,
            },
        )

    @decorators.action(
        detail=True,
        methods=['get'],
        url_path=r'auto-run/(?P<run_id>[0-9a-fA-F\-]+)',
    )
    def auto_run_detail(self, request, pk=None, run_id=None):
        source = self.get_object()
        try:
            run_uuid = uuid.UUID(str(run_id))
        except (TypeError, ValueError):
            return response.Response({'detail': 'Ungültige run_id.'}, status=400)
        jobs = list(
            CurriculumExtractionJob.objects.filter(
                source=source,
                auto_run_id=run_uuid,
            ).order_by('plan_index'),
        )
        data = [CurriculumExtractionJobSerializer(j).data for j in jobs]
        completed = sum(1 for j in jobs if j.status == CurriculumExtractionJob.STATUS_COMPLETED)
        failed = sum(1 for j in jobs if j.status == CurriculumExtractionJob.STATUS_FAILED)
        running = sum(
            1
            for j in jobs
            if j.status in {CurriculumExtractionJob.STATUS_RUNNING, CurriculumExtractionJob.STATUS_PENDING}
        )
        return response.Response(
            {
                'source': CurriculumSourceSerializer(source).data,
                'run_id': str(run_uuid),
                'jobs': data,
                'summary': {
                    'total': len(jobs),
                    'completed': completed,
                    'failed': failed,
                    'running': running,
                },
            },
        )

    @decorators.action(
        detail=True,
        methods=['post'],
        url_path=r'auto-run/(?P<run_id>[0-9a-fA-F\-]+)/approve',
    )
    def auto_run_approve(self, request, pk=None, run_id=None):
        source = self.get_object()
        try:
            run_uuid = uuid.UUID(str(run_id))
        except (TypeError, ValueError):
            return response.Response({'detail': 'Ungültige run_id.'}, status=400)
        ser = CurriculumAutoApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            result = CurriculumContextApprovalService.approve_run(
                source,
                run_uuid,
                activate=ser.validated_data.get('activate', True),
                replicate_states=ser.validated_data.get('replicate_states') or None,
                skip_indices=ser.validated_data.get('skip_indices') or None,
                edited_contexts=ser.validated_data.get('edited_contexts') or None,
                reviewer=request.user if request.user.is_authenticated else None,
            )
        except Exception as exc:
            return response.Response({'detail': str(exc)}, status=400)
        return response.Response(result)

    @decorators.action(
        detail=True,
        methods=['get'],
        url_path=r'pages/(?P<page_number>[0-9]+)',
    )
    def page_detail(self, request, pk=None, page_number=None):
        source = self.get_object()
        try:
            pn = int(page_number)
        except (TypeError, ValueError):
            return response.Response({'detail': 'Ungültige Seitennummer.'}, status=400)
        for r in source.extracted_pages or []:
            if isinstance(r, dict) and int(r.get('page') or -1) == pn:
                return response.Response(
                    {
                        'page': pn,
                        'text': r.get('text') or '',
                        'char_count': r.get('char_count'),
                        'preview_text': r.get('preview_text'),
                        'has_text': r.get('has_text'),
                    },
                )
        return response.Response({'detail': 'Seite nicht gefunden.'}, status=404)
