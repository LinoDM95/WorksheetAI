from datetime import timedelta

from rest_framework import viewsets, decorators, response, status, exceptions
import copy

from django.db.models import Avg, Count, Q
from django.utils import timezone
from django.utils.html import strip_tags

from apps.ai.error_mapper import AIErrorMapper
from apps.accounts.permissions import APIPaywallMixin
from apps.accounts.services.credits import enforce_positive_ai_credits_balance
from apps.patterns.models import WorksheetPattern

from .models import Worksheet, WorksheetLibraryComment, WorksheetRating
from .serializers import (
    WorksheetSerializer,
    WorksheetRevisionSerializer,
    build_curriculum_usage_payload,
    WorksheetLibraryEntrySerializer,
    WorksheetLibraryCommentCreateSerializer,
    WorksheetLibraryCommentSerializer,
    worksheet_library_entry_detail_dict,
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
    worksheet_metadata_snapshot,
)
from .owner import resolve_worksheet_owner


class WorksheetViewSet(APIPaywallMixin, viewsets.ModelViewSet):
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

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(
            queryset,
            many=True,
            context={**self.get_serializer_context(), 'worksheet_list': True},
        )
        return response.Response(serializer.data)

    @decorators.action(detail=False, methods=['get'], url_path='library')
    def library_list(self, request):
        try:
            user = resolve_worksheet_owner(request.user)
        except ValueError:
            return response.Response([])
        qs = (
            Worksheet.objects.filter(
                library_public=True,
                library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
            )
            .select_related('owner', 'pattern')
            .annotate(
                avg_rating=Avg('ratings__stars'),
                rating_count=Count('ratings', distinct=True),
                comment_count=Count('library_comments', distinct=True),
            )
        )
        scope = (request.query_params.get('scope') or 'all').strip().lower()
        if scope == 'mine':
            qs = qs.filter(owner=user)
        qs = qs.order_by('-library_published_at', '-created_at')
        return response.Response(
            WorksheetLibraryEntrySerializer(qs, many=True, context={'request': request}).data,
        )

    @decorators.action(detail=True, methods=['get'], url_path='library-entry')
    def library_entry(self, request, pk=None):
        try:
            resolve_worksheet_owner(request.user)
        except ValueError:
            return response.Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = (
            Worksheet.objects.filter(
                pk=pk,
                library_public=True,
                library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
            )
            .select_related('owner', 'pattern')
            .annotate(
                avg_rating=Avg('ratings__stars'),
                rating_count=Count('ratings', distinct=True),
                comment_count=Count('library_comments', distinct=True),
            )
        )
        ws = qs.first()
        if not ws:
            raise exceptions.NotFound()
        payload = worksheet_library_entry_detail_dict(ws, request)
        return response.Response(payload)

    @decorators.action(detail=True, methods=['get', 'post'], url_path='library-comments')
    def library_comments(self, request, pk=None):
        ws = Worksheet.objects.filter(
            pk=pk,
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
        ).first()
        if not ws:
            raise exceptions.NotFound()

        if request.method == 'GET':
            rows = ws.library_comments.order_by('-created_at')[:200]
            return response.Response(WorksheetLibraryCommentSerializer(rows, many=True).data)

        try:
            user = resolve_worksheet_owner(request.user)
        except ValueError:
            return response.Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ser = WorksheetLibraryCommentCreateSerializer(data=request.data)
        if not ser.is_valid():
            return response.Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        raw_text = ser.validated_data['text']
        text = strip_tags(raw_text).strip()
        if not text:
            return response.Response(
                {'detail': 'Bitte einen kurzen Text ohne HTML eingeben.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(text) > 2000:
            text = text[:2000]

        hour_ago = timezone.now() - timedelta(hours=1)
        recent_n = WorksheetLibraryComment.objects.filter(
            worksheet=ws, user=user, created_at__gte=hour_ago
        ).count()
        if recent_n >= 24:
            return response.Response(
                {'detail': 'Zu viele Kommentare in kurzer Zeit. Bitte später erneut versuchen.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        c = WorksheetLibraryComment.objects.create(worksheet=ws, user=user, body=text)
        return response.Response(
            WorksheetLibraryCommentSerializer(c).data,
            status=status.HTTP_201_CREATED,
        )

    @decorators.action(detail=True, methods=['post'], url_path='rate')
    def rate(self, request, pk=None):
        ws = Worksheet.objects.filter(
            pk=pk,
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
        ).first()
        if not ws:
            raise exceptions.NotFound()
        body = request.data if isinstance(request.data, dict) else {}
        stars = body.get('stars')
        try:
            s = int(stars)
        except (TypeError, ValueError):
            return response.Response(
                {'detail': 'Bewertung: bitte Sterne 1–5 angeben.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if s not in (1, 2, 3, 4, 5):
            return response.Response(
                {'detail': 'Bewertung: bitte Sterne 1–5 angeben.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = resolve_worksheet_owner(request.user)
        WorksheetRating.objects.update_or_create(worksheet=ws, user=user, defaults={'stars': s})
        agg = ws.ratings.aggregate(avg_rating=Avg('stars'), rating_count=Count('id'))
        avg = agg['avg_rating']
        return response.Response({
            'stars': s,
            'avg_rating': round(float(avg), 2) if avg is not None else None,
            'rating_count': agg['rating_count'],
        })

    @decorators.action(detail=True, methods=['post'], url_path='adopt-from-library')
    def adopt_from_library(self, request, pk=None):
        original = Worksheet.objects.filter(
            pk=pk,
            library_public=True,
            library_moderation_status=Worksheet.LibraryModerationStatus.APPROVED,
        ).first()
        if not original:
            raise exceptions.NotFound()
        user = resolve_worksheet_owner(request.user)

        lt_raw = (original.library_listing_title or original.title or '').strip()
        base_title = lt_raw or 'Arbeitsblatt'
        suffix = ' (übernommen)'
        max_base = max(0, 255 - len(suffix))
        new_title = f'{base_title[:max_base]}{suffix}'

        clone = Worksheet.objects.create(
            owner=user,
            pattern=original.pattern,
            title=new_title,
            subject=original.subject,
            grade=original.grade,
            topic=(original.library_listing_topic or original.topic or '').strip()[:255],
            page_setup=copy.deepcopy(original.page_setup) if isinstance(original.page_setup, dict) else {},
            content=copy.deepcopy(original.content) if isinstance(original.content, dict) else {},
            render_model=(
                copy.deepcopy(original.render_model) if isinstance(original.render_model, dict) else {}
            ),
            status='draft',
            generation_meta=(
                copy.deepcopy(original.generation_meta) if isinstance(original.generation_meta, dict) else {}
            ),
            library_public=False,
            library_listing_title='',
            library_listing_topic='',
            library_listing_description='',
            library_moderation_status=Worksheet.LibraryModerationStatus.NONE,
            library_published_at=None,
            source_worksheet=original,
        )
        create_initial_revision_if_absent(clone, user=user, prompt='(Aus Bibliothek übernommen)')
        return response.Response(
            WorksheetSerializer(clone, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
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
