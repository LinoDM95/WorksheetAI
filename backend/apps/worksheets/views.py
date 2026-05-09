from rest_framework import viewsets, decorators, response, status
import copy

from django.db import transaction
from django.db.models import Q

from apps.ai.error_mapper import AIErrorMapper
from apps.accounts.services.credits import enforce_positive_ai_credits_balance
from apps.patterns.models import WorksheetPattern

from .models import Worksheet
from .serializers import (
    WorksheetSerializer,
    WorksheetRevisionSerializer,
    build_curriculum_usage_payload,
    WorksheetLibraryEntrySerializer,
)
from .services.content_blocks import apply_page_coalesce_to_content, apply_page_overflow_reflow
from .services.creative_html_pipeline import (
    build_creative_html_render_model,
    is_creative_html_content,
    repair_creative_html_worksheet,
    worksheet_pages_are_creative_html_shape,
)
from .services.generation import generate_worksheet
from .services.page_regenerate import regenerate_worksheet_page, regenerate_worksheet_pages
from .services.page import normalize_page_setup
from .services.render_model import build_render_model
from .services.worksheet_revision_head import (
    apply_revision_to_worksheet,
    create_initial_revision_if_absent,
    persist_worksheet_after_ai_regenerate,
    require_worksheet_at_revision_head,
    revision_revert_restore_bundle,
    worksheet_metadata_snapshot,
)
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
        req = {
            'theme': (ws.render_model or {}).get('theme', 'neutral'),
            'creativity': (ws.render_model or {}).get('creativity', 'balanced'),
            'show_sheet_header': (ws.render_model or {}).get('show_sheet_header', True),
        }
        if isinstance(content, dict) and (
            is_creative_html_content(content) or worksheet_pages_are_creative_html_shape(content)
        ):
            content, _notes = repair_creative_html_worksheet(content, ws.page_setup)
            rm = build_creative_html_render_model(content, ws.page_setup, req)
            return response.Response({'render_model': rm, 'content': content})

        content, _ = apply_page_coalesce_to_content(content, page_setup=ws.page_setup)
        content, _ = apply_page_overflow_reflow(content, page_setup=ws.page_setup)
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
        try:
            rev_user = resolve_worksheet_owner(request.user)
        except ValueError:
            rev_user = None
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
            require_worksheet_at_revision_head(ws)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=400)
        create_initial_revision_if_absent(ws, user=rev_user, prompt='(Historie)')
        ws.refresh_from_db()
        prev_content = (
            copy.deepcopy(body_content)
            if isinstance(body_content, dict)
            else copy.deepcopy(ws.content) if isinstance(ws.content, dict) else {}
        )
        prev_render_model = copy.deepcopy(ws.render_model) if isinstance(ws.render_model, dict) else {}
        prev_meta = worksheet_metadata_snapshot(ws)
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
        persist_worksheet_after_ai_regenerate(
            ws,
            user=rev_user,
            prev_content=prev_content,
            prev_render_model=prev_render_model,
            prev_meta=prev_meta,
            new_content=content,
            new_render_model=render_model,
            prompt=str(instruction).strip()[:4000],
            revision_mode='general',
            ai_raw_output={'page_index': page_index},
            validation_notes=notes,
        )
        ws.refresh_from_db()
        return response.Response(WorksheetSerializer(ws, context={'request': request}).data)

    @decorators.action(detail=True, methods=['post'], url_path='regenerate-pages')
    def regenerate_pages_view(self, request, pk=None):
        enforce_positive_ai_credits_balance(request.user)
        ws = self.get_object()
        try:
            rev_user = resolve_worksheet_owner(request.user)
        except ValueError:
            rev_user = None
        instruction = request.data.get('teacher_instruction') or ''
        body_content = request.data.get('content')
        raw_indices = request.data.get('page_indices')
        if raw_indices is None:
            return response.Response({'detail': 'page_indices ist erforderlich.'}, status=400)
        if not isinstance(raw_indices, list):
            return response.Response({'detail': 'page_indices muss eine Liste von Zahlen sein.'}, status=400)
        parsed: list[int] = []
        for item in raw_indices:
            try:
                parsed.append(int(item))
            except (TypeError, ValueError):
                return response.Response(
                    {'detail': 'page_indices enthält ungültige Einträge.'},
                    status=400,
                )
        try:
            require_worksheet_at_revision_head(ws)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=400)
        create_initial_revision_if_absent(ws, user=rev_user, prompt='(Historie)')
        ws.refresh_from_db()
        prev_content = (
            copy.deepcopy(body_content)
            if isinstance(body_content, dict)
            else copy.deepcopy(ws.content) if isinstance(ws.content, dict) else {}
        )
        prev_render_model = copy.deepcopy(ws.render_model) if isinstance(ws.render_model, dict) else {}
        prev_meta = worksheet_metadata_snapshot(ws)
        try:
            content, render_model, notes = regenerate_worksheet_pages(
                ws,
                parsed,
                instruction,
                body_content,
            )
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=400)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='KI-Aufruf fehlgeschlagen')
        persist_worksheet_after_ai_regenerate(
            ws,
            user=rev_user,
            prev_content=prev_content,
            prev_render_model=prev_render_model,
            prev_meta=prev_meta,
            new_content=content,
            new_render_model=render_model,
            prompt=str(instruction).strip()[:4000],
            revision_mode='general',
            ai_raw_output={'page_indices': parsed},
            validation_notes=notes,
        )
        ws.refresh_from_db()
        return response.Response(WorksheetSerializer(ws, context={'request': request}).data)

    @decorators.action(detail=True, methods=['get'], url_path='revisions')
    def list_revisions(self, request, pk=None):
        ws = self.get_object()
        qs = ws.revisions.order_by('-created_at')
        return response.Response(WorksheetRevisionSerializer(qs, many=True).data)

    @decorators.action(detail=True, methods=['post'], url_path='revert-revision')
    def revert_revision(self, request, pk=None):
        ws = self.get_object()
        rev = ws.revisions.order_by('-created_at').first()
        if not rev:
            return response.Response(
                {'detail': 'Keine Revision zum Zurücksetzen.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        body = request.data if isinstance(request.data, dict) else {}
        rid = body.get('revision_id')
        if rid is not None and str(rev.id) != str(rid):
            return response.Response(
                {
                    'detail': (
                        'Es kann nur die zuletzt erzeugte Revision zurückgenommen werden. '
                        'Bitte Seite aktualisieren, falls zwischenzeitlich eine neuere Revision existiert.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        pc, prm, pm = revision_revert_restore_bundle(rev)
        with transaction.atomic():
            ws.content = copy.deepcopy(pc)
            ws.render_model = copy.deepcopy(prm)
            if 'title' in pm:
                ws.title = str(pm.get('title') or '')[:255]
            elif isinstance(pc, dict) and pc.get('title'):
                ws.title = str(pc.get('title') or '')[:255]
            if 'subject' in pm:
                ws.subject = str(pm.get('subject') or '')[:120]
            if 'topic' in pm:
                ws.topic = str(pm.get('topic') or '')[:255]
            if 'grade' in pm:
                ws.grade = pm.get('grade')
            ws.save()
            rev.delete()
        ws.refresh_from_db()
        return response.Response(WorksheetSerializer(ws, context={'request': request}).data)

    @decorators.action(detail=True, methods=['post'], url_path='apply-revision')
    def apply_revision(self, request, pk=None):
        ws = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        rid = body.get('revision_id')
        if not rid:
            return response.Response(
                {'detail': 'Parameter revision_id fehlt.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = ws.revisions.filter(pk=rid).first()
        if not target:
            return response.Response(
                {'detail': 'Revision nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            rev_user = resolve_worksheet_owner(request.user)
        except ValueError:
            rev_user = None
        try:
            apply_revision_to_worksheet(ws, target=target, user=rev_user)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        ws.refresh_from_db()
        return response.Response(WorksheetSerializer(ws, context={'request': request}).data)

    @decorators.action(detail=True, methods=['post'], url_path='delete-revision')
    def delete_revision(self, request, pk=None):
        ws = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        rid = body.get('revision_id')
        if not rid:
            return response.Response(
                {'detail': 'Parameter revision_id fehlt.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = ws.revisions.filter(pk=rid).first()
        if not target:
            return response.Response(
                {'detail': 'Revision nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        latest = ws.revisions.order_by('-created_at').first()
        if latest is not None and latest.id == target.id:
            return response.Response(
                {'detail': 'Die aktuelle Version kann nicht gelöscht werden.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target.delete()
        ws.refresh_from_db()
        return response.Response(WorksheetSerializer(ws, context={'request': request}).data)

    @decorators.action(detail=False, methods=['post'], url_path='page-preview')
    def page_preview(self, request):
        return response.Response(normalize_page_setup(request.data or {}))

    @decorators.action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        ws = self.get_object()
        base = (ws.title or '').strip() or 'Arbeitsblatt'
        suffix = ' (Kopie)'
        max_base = max(0, 255 - len(suffix))
        new_title = f'{base[:max_base]}{suffix}'
        clone = Worksheet(
            owner=ws.owner,
            pattern=ws.pattern,
            title=new_title,
            subject=ws.subject,
            grade=ws.grade,
            topic=ws.topic,
            page_setup=copy.deepcopy(ws.page_setup) if isinstance(ws.page_setup, dict) else {},
            content=copy.deepcopy(ws.content) if isinstance(ws.content, dict) else {},
            render_model=copy.deepcopy(ws.render_model) if isinstance(ws.render_model, dict) else {},
            status='draft',
            generation_meta=copy.deepcopy(ws.generation_meta) if isinstance(ws.generation_meta, dict) else {},
            library_public=False,
            library_listing_title='',
            library_listing_topic='',
            library_listing_description='',
            library_moderation_status=Worksheet.LibraryModerationStatus.NONE,
            library_published_at=None,
        )
        clone.save()
        try:
            dup_user = resolve_worksheet_owner(request.user)
        except ValueError:
            dup_user = None
        create_initial_revision_if_absent(clone, user=dup_user, prompt='(Kopie)')
        return response.Response(
            WorksheetSerializer(clone, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )
