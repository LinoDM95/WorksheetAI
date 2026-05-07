from rest_framework import viewsets, decorators, response
import copy

from django.db.models import Q

from apps.ai.error_mapper import AIErrorMapper
from apps.accounts.services.credits import enforce_positive_ai_credits_balance
from apps.patterns.models import WorksheetPattern

from .models import Worksheet
from .serializers import WorksheetSerializer, build_curriculum_usage_payload, WorksheetLibraryEntrySerializer
from .services.content_blocks import apply_page_coalesce_to_content, apply_page_overflow_reflow
from .services.generation import generate_worksheet
from .services.page_regenerate import regenerate_worksheet_page
from .services.page import normalize_page_setup
from .services.render_model import build_render_model
from .owner import resolve_worksheet_owner


class WorksheetViewSet(viewsets.ModelViewSet):
    serializer_class = WorksheetSerializer

    def get_queryset(self):
        user = resolve_worksheet_owner(self.request.user)
        qs = Worksheet.objects.select_related('pattern').prefetch_related('curriculum_usages')
        if self.action in ('update', 'partial_update', 'destroy'):
            return qs.filter(owner=user)
        if self.action == 'retrieve':
            return qs.filter(
            Q(owner=user)
            | Q(
                library_public=True,
                library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
            ),
        )
        return qs.filter(owner=user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(owner=resolve_worksheet_owner(self.request.user))

    @decorators.action(detail=False, methods=['get'], url_path='library')
    def library_list(self, request):
        try:
            user = resolve_worksheet_owner(request.user)
        except ValueError:
            return response.Response([])
        qs = Worksheet.objects.filter(
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
        ).select_related('owner', 'pattern')
        scope = (request.query_params.get('scope') or 'all').strip().lower()
        if scope == 'mine':
            qs = qs.filter(owner=user)
        qs = qs.order_by('-library_published_at', '-created_at')
        return response.Response(
            WorksheetLibraryEntrySerializer(qs, many=True, context={'request': request}).data,
        )

    @decorators.action(detail=True, methods=['post'], url_path='preview-render')
    def preview_render(self, request, pk=None):
        ws = self.get_object()
        raw = request.data.get('content', ws.content)
        content = copy.deepcopy(raw) if isinstance(raw, dict) else copy.deepcopy(ws.content)
        content, _ = apply_page_coalesce_to_content(content)
        content, _ = apply_page_overflow_reflow(content)
        req = {
            'theme': (ws.render_model or {}).get('theme', 'neutral'),
            'creativity': (ws.render_model or {}).get('creativity', 'balanced'),
        }
        rm = build_render_model(content, ws.page_setup, ws.pattern, req)
        return response.Response({'render_model': rm, 'content': content})

    @decorators.action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        enforce_positive_ai_credits_balance(request.user)
        try:
            ws = generate_worksheet(request.user, request.data)
            return response.Response(WorksheetSerializer(ws).data, status=201)
        except WorksheetPattern.DoesNotExist:
            return response.Response(
                {'detail': 'Die gewählte Vorlage existiert nicht.', 'error_code': 'pattern_not_found'},
                status=404,
            )
        except Exception as exc:
            return AIErrorMapper.to_response(exc)

    @decorators.action(detail=True, methods=['get'], url_path='curriculum-usage')
    def curriculum_usage(self, request, pk=None):
        ws = self.get_object()
        return response.Response(build_curriculum_usage_payload(ws))

    @decorators.action(detail=True, methods=['post'], url_path='regenerate-page')
    def regenerate_page_view(self, request, pk=None):
        enforce_positive_ai_credits_balance(request.user)
        ws = self.get_object()
        raw_idx = request.data.get('page_index')
        if raw_idx is None:
            return response.Response({'detail': 'page_index ist erforderlich.'}, status=400)
        try:
            page_index = int(raw_idx)
        except (TypeError, ValueError):
            return response.Response({'detail': 'page_index muss eine Zahl sein.'}, status=400)
        instruction = request.data.get('teacher_instruction') or ''
        body_content = request.data.get('content')
        try:
            content, render_model, notes = regenerate_worksheet_page(
                ws,
                page_index,
                instruction,
                body_content,
            )
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=400)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='KI-Aufruf fehlgeschlagen')
        out = {'content': content, 'render_model': render_model}
        if notes:
            out['validation_notes'] = notes
        return response.Response(out)

    @decorators.action(detail=False, methods=['post'], url_path='page-preview')
    def page_preview(self, request):
        return response.Response(normalize_page_setup(request.data or {}))
