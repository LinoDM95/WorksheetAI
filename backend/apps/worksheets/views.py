from rest_framework import viewsets, decorators, response, status
import copy

from .models import Worksheet
from .serializers import WorksheetSerializer
from .services.content_blocks import apply_page_coalesce_to_content, apply_page_overflow_reflow
from .services.generation import generate_worksheet
from .services.page_regenerate import regenerate_worksheet_page
from .services.page import normalize_page_setup
from .services.render_model import build_render_model
from .owner import resolve_worksheet_owner


def _ai_http_detail(exc: BaseException) -> str:
    s = str(exc)
    if (
        'DEADLINE_EXCEEDED' in s
        or '504' in s
        or 'timed out' in s.lower()
        or 'timeout' in s.lower()
        or 'Deadline' in s
    ):
        return (
            'Zeitüberschreitung bei der KI (DEADLINE_EXCEEDED). '
            'In backend/.env GEMINI_TIMEOUT_SECONDS erhöhen (z. B. 600), Server neu starten. '
            'Alternativ schnelleres Modell: GEMINI_MODEL=gemini-2.5-flash'
        )
    return s


class WorksheetViewSet(viewsets.ModelViewSet):
    serializer_class=WorksheetSerializer
    def get_queryset(self): return Worksheet.objects.filter(owner=resolve_worksheet_owner(self.request.user)).order_by('-created_at')
    def perform_create(self, serializer): serializer.save(owner=resolve_worksheet_owner(self.request.user))

    @decorators.action(detail=True, methods=['post'], url_path='preview-render')
    def preview_render(self, request, pk=None):
        ws=self.get_object()
        raw=request.data.get('content', ws.content)
        content=copy.deepcopy(raw) if isinstance(raw, dict) else copy.deepcopy(ws.content)
        content, _ = apply_page_coalesce_to_content(content)
        content, _ = apply_page_overflow_reflow(content)
        req={
            'theme':(ws.render_model or {}).get('theme','neutral'),
            'creativity':(ws.render_model or {}).get('creativity','balanced'),
        }
        rm=build_render_model(content, ws.page_setup, ws.pattern, req)
        return response.Response({'render_model': rm, 'content': content})

    @decorators.action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        try:
            ws=generate_worksheet(request.user, request.data)
            return response.Response(WorksheetSerializer(ws).data, status=201)
        except Exception as e:
            return response.Response({'detail': _ai_http_detail(e)}, status=400)

    @decorators.action(detail=True, methods=['post'], url_path='regenerate-page')
    def regenerate_page_view(self, request, pk=None):
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
        except ValueError as e:
            return response.Response({'detail': str(e)}, status=400)
        except Exception as e:
            return response.Response(
                {'detail': f'KI-Aufruf fehlgeschlagen: {_ai_http_detail(e)}'},
                status=502,
            )
        out = {'content': content, 'render_model': render_model}
        if notes:
            out['validation_notes'] = notes
        return response.Response(out)

    @decorators.action(detail=False, methods=['post'], url_path='page-preview')
    def page_preview(self, request):
        return response.Response(normalize_page_setup(request.data or {}))
