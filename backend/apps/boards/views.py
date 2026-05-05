from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
import secrets
from rest_framework import decorators, exceptions, permissions, response, status, viewsets
from rest_framework.views import APIView

from apps.ai.error_mapper import AIErrorMapper

from .models import Board, BoardFolder, BoardRating, BoardRevision
from .owner import resolve_board_owner
from .serializers import (
    BoardDetailSerializer,
    BoardFolderSerializer,
    BoardLibraryEntrySerializer,
    BoardListSerializer,
    BoardRevisionSerializer,
)
from .services.free_html_generation import (
    FreeHtmlBoardGenerationService,
    FreeHtmlBoardRevisionService,
    validate_free_html_code,
)
from .services.free_html_block_generation import FreeHtmlBlockBoardGenerationService
from .services.blocks.registry import CATEGORIES, public_block_registry
from .services.blocks.themes import theme_summary
from .services.free_html_sanitize import validate_free_html_bundle


class PublicBoardPlayView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = ()

    def get(self, request, share_token):
        board = (
            Board.objects.filter(share_token=share_token, student_link_enabled=True)
            .only('title', 'html', 'css', 'javascript', 'used_libraries', 'used_datasets')
            .first()
        )
        if not board:
            return response.Response({'detail': 'Tafelbild nicht gefunden oder Link nicht aktiv.'}, status=404)
        return response.Response(
            {
                'title': board.title,
                'html': board.html or '',
                'css': board.css or '',
                'javascript': board.javascript or '',
                'used_libraries': list(board.used_libraries or []),
                'used_datasets': list(board.used_datasets or []),
            }
        )



_PATCHABLE_TEXT_FIELDS = {'title', 'description'}
_PATCHABLE_CODE_FIELDS = {'html', 'css', 'javascript'}
_PATCHABLE_META_FIELDS = {'teacher_notes', 'usage_instructions', 'warnings'}


class BoardFolderViewSet(viewsets.ModelViewSet):
    """Hierarchische Galerie-Ordner (Fach, Klassenstufe, …) pro Lehrkraft."""

    serializer_class = BoardFolderSerializer

    def get_queryset(self):
        try:
            owner = resolve_board_owner(self.request.user)
        except ValueError:
            return BoardFolder.objects.none()
        return BoardFolder.objects.filter(owner=owner)

    def perform_create(self, serializer):
        serializer.save(owner=resolve_board_owner(self.request.user))

    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class BoardViewSet(viewsets.ModelViewSet):
    """CRUD + KI-Generierung/Revision für Free-HTML5-Tafelbilder."""

    def get_object(self):
        if self.action in ('rate', 'adopt_from_library'):
            pk = self.kwargs['pk']
            board = Board.objects.filter(pk=pk, library_public=True).first()
            if not board:
                raise exceptions.NotFound()
            return board
        return super().get_object()

    def get_queryset(self):
        try:
            owner = resolve_board_owner(self.request.user)
        except ValueError:
            return Board.objects.none()
        return Board.objects.filter(owner=owner).select_related('folder')

    def get_serializer_class(self):
        if self.action == 'list':
            return BoardListSerializer
        return BoardDetailSerializer

    def perform_create(self, serializer):
        serializer.save(owner=resolve_board_owner(self.request.user))

    def update(self, request, *args, **kwargs):
        return self._patch_with_validation(request, partial=False, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self._patch_with_validation(request, partial=True, *args, **kwargs)

    def _patch_with_validation(self, request, partial, *args, **kwargs):
        instance = self.get_object()
        body = request.data if isinstance(request.data, dict) else dict(request.data)

        text_changes = {k: body[k] for k in _PATCHABLE_TEXT_FIELDS if k in body}
        meta_changes = {k: body[k] for k in _PATCHABLE_META_FIELDS if k in body}
        code_changes = {k: body[k] for k in _PATCHABLE_CODE_FIELDS if k in body}
        folder_id_key = 'folder_id'
        folder_touched = folder_id_key in body

        for k, v in text_changes.items():
            setattr(instance, k, str(v or '')[:5000 if k == 'description' else 255])

        if meta_changes:
            if 'teacher_notes' in meta_changes:
                instance.teacher_notes = str(meta_changes['teacher_notes'] or '')[:8000]
            if 'usage_instructions' in meta_changes and isinstance(meta_changes['usage_instructions'], list):
                instance.usage_instructions = [str(x) for x in meta_changes['usage_instructions'] if x][:50]
            if 'warnings' in meta_changes and isinstance(meta_changes['warnings'], list):
                instance.warnings = [str(x) for x in meta_changes['warnings'] if x][:50]

        if code_changes:
            merged = {
                'html': code_changes.get('html', instance.html or ''),
                'css': code_changes.get('css', instance.css or ''),
                'javascript': code_changes.get('javascript', instance.javascript or ''),
                'teacher_notes': instance.teacher_notes or '',
                'usage_instructions': list(instance.usage_instructions or []),
                'warnings': list(instance.warnings or []),
                'used_libraries': list(instance.used_libraries or []),
                'used_assets': list(instance.used_assets or []),
                'used_datasets': list(instance.used_datasets or []),
            }
            bundle = FreeHtmlBoardGenerationService.sanitize_payload(merged)
            ok, errors, warns = validate_free_html_bundle(bundle)
            if not ok:
                return response.Response(
                    {'detail': 'Free-HTML-Inhalt enthält blockierte Muster.', 'errors': errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance.html = bundle['html']
            instance.css = bundle['css']
            instance.javascript = bundle['javascript']
            instance.validation_errors = errors
            instance.validation_warnings = warns

        if folder_touched:
            try:
                owner = resolve_board_owner(request.user)
            except ValueError:
                return response.Response(
                    {'detail': 'Authentifizierung erforderlich.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            raw_fid = body[folder_id_key]
            if raw_fid in (None, '', 'null'):
                instance.folder = None
            else:
                fid = str(raw_fid)
                folder = BoardFolder.objects.filter(pk=fid, owner=owner).first()
                if not folder:
                    return response.Response(
                        {'detail': 'Ordner nicht gefunden oder keine Berechtigung.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                instance.folder = folder

        if 'student_link_enabled' in body:
            instance.student_link_enabled = bool(body['student_link_enabled'])
            if instance.student_link_enabled and not instance.share_token:
                instance.share_token = secrets.token_urlsafe(32)[:64]

        if 'library_public' in body:
            instance.library_public = bool(body['library_public'])
            if instance.library_public:
                instance.library_published_at = timezone.now()
            else:
                instance.library_published_at = None

        instance.save()
        return response.Response(BoardDetailSerializer(instance, context={'request': request}).data)

    @decorators.action(detail=False, methods=['get'], url_path='ai-options')
    def ai_options(self, request):
        from apps.boards.services.free_html_visual_qa import (
            default_visual_qa_document_base,
            visual_qa_playwright_available,
        )

        base_ok = bool(default_visual_qa_document_base())
        playwright_ok = visual_qa_playwright_available()
        allow = bool(getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True))
        return response.Response({
            'claude_ultra_available': bool((getattr(settings, 'CLAUDE_API_KEY', None) or '').strip()),
            'visual_qa_available': bool(playwright_ok and base_ok and allow),
            'visual_qa_document_base_configured': base_ok,
        })

    @decorators.action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        try:
            board = FreeHtmlBoardGenerationService(request.user, request.data).run()
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='Tafelbild-Generierung fehlgeschlagen')
        return response.Response(BoardDetailSerializer(board, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=False, methods=['get'], url_path='blocks')
    def blocks_registry(self, request):
        """Listet alle verfügbaren Bausteine + Kategorien + Themes für den Builder-UI."""
        return response.Response({
            'blocks': public_block_registry(),
            'categories': list(CATEGORIES),
            'themes': theme_summary(),
        })

    @decorators.action(detail=False, methods=['post'], url_path='generate-blocks')
    def generate_from_blocks(self, request):
        """Bausteinmodus: erzeugt ein Tafelbild deterministisch aus einer CompositionSpec."""
        body = request.data if isinstance(request.data, dict) else {}
        try:
            board = FreeHtmlBlockBoardGenerationService(request.user, body).run()
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='Bausteinmodus-Generierung fehlgeschlagen')
        return response.Response(
            BoardDetailSerializer(board, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @decorators.action(detail=True, methods=['post'], url_path='revise')
    def revise(self, request, pk=None):
        board = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        prompt = body.get('prompt') or ''
        tier = body.get('ai_quality_tier')
        try:
            revision = FreeHtmlBoardRevisionService(
                board,
                prompt,
                request.user,
                ai_quality_tier=tier if isinstance(tier, str) else None,
            ).run()
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='Tafelbild-Revision fehlgeschlagen')
        board.refresh_from_db()
        return response.Response(
            {
                'board': BoardDetailSerializer(board, context={'request': request}).data,
                'revision': BoardRevisionSerializer(revision).data,
            }
        )

    @decorators.action(detail=True, methods=['post'], url_path='validate')
    def validate(self, request, pk=None):
        board = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        html = body.get('html', board.html or '')
        css = body.get('css', board.css or '')
        js = body.get('javascript', board.javascript or '')
        ok, errors, warns = validate_free_html_code(html, css, js)
        return response.Response({'ok': ok, 'errors': errors, 'warnings': warns})

    @decorators.action(detail=True, methods=['get'], url_path='revisions')
    def list_revisions(self, request, pk=None):
        board = self.get_object()
        qs = board.revisions.order_by('-created_at')
        return response.Response(BoardRevisionSerializer(qs, many=True).data)

    @decorators.action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        original = self.get_object()
        clone = Board.objects.create(
            owner=resolve_board_owner(request.user),
            title=f'{original.title} (Kopie)'[:255],
            description=original.description,
            subject=original.subject,
            grade=original.grade,
            topic=original.topic,
            board_type=original.board_type,
            status=original.status,
            html=original.html,
            css=original.css,
            javascript=original.javascript,
            teacher_notes=original.teacher_notes,
            usage_instructions=list(original.usage_instructions or []),
            warnings=list(original.warnings or []),
            used_libraries=list(original.used_libraries or []),
            used_assets=list(original.used_assets or []),
            used_datasets=list(original.used_datasets or []),
            folder=original.folder,
            generation_prompt=original.generation_prompt,
            generation_input=dict(original.generation_input or {}),
            validation_errors=list(original.validation_errors or []),
            validation_warnings=list(original.validation_warnings or []),
            share_token=None,
            student_link_enabled=False,
            library_public=False,
            library_published_at=None,
            source_board=None,
        )
        return response.Response(BoardDetailSerializer(clone, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=['post'], url_path='revert-revision')
    def revert_revision(self, request, pk=None):
        """Stellt den Stand vor der jüngsten KI-Revision wieder her und entfernt deren Datensatz."""
        board = self.get_object()
        rev = board.revisions.order_by('-created_at').first()
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

        meta = rev.previous_metadata if isinstance(rev.previous_metadata, dict) else {}
        raw = {
            'html': rev.previous_html or '',
            'css': rev.previous_css or '',
            'javascript': rev.previous_javascript or '',
            'teacher_notes': str(meta.get('teacher_notes') or ''),
            'usage_instructions': meta.get('usage_instructions') or [],
            'warnings': meta.get('warnings') or [],
            'used_libraries': meta.get('used_libraries') or [],
            'used_assets': meta.get('used_assets') or [],
            'used_datasets': meta.get('used_datasets') or [],
        }
        bundle = FreeHtmlBoardGenerationService.sanitize_payload(raw)
        ok, errors, warns = validate_free_html_bundle(bundle)
        if not ok:
            return response.Response(
                {'detail': 'Wiederhergestellter Inhalt enthält blockierte Muster.', 'errors': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        board.html = bundle['html']
        board.css = bundle['css']
        board.javascript = bundle['javascript']
        board.teacher_notes = bundle['teacher_notes']
        board.usage_instructions = bundle['usage_instructions']
        board.warnings = bundle['warnings']
        board.used_libraries = bundle['used_libraries']
        board.used_assets = bundle['used_assets']
        board.used_datasets = bundle['used_datasets']
        board.validation_errors = errors
        board.validation_warnings = warns
        if meta.get('title') is not None:
            board.title = str(meta.get('title') or '')[:255]
        if meta.get('description') is not None:
            board.description = str(meta.get('description') or '')[:5000]
        board.status = 'generated' if ok else board.status

        with transaction.atomic():
            board.save()
            rev.delete()

        board.refresh_from_db()
        return response.Response(BoardDetailSerializer(board, context={'request': request}).data)

    @decorators.action(detail=False, methods=['get'], url_path='library')
    def library_list(self, request):
        try:
            resolve_board_owner(request.user)
        except ValueError:
            return response.Response([])
        qs = (
            Board.objects.filter(library_public=True)
            .select_related('owner')
            .annotate(avg_rating=Avg('ratings__stars'), rating_count=Count('ratings', distinct=True))
            .order_by('-library_published_at', '-created_at')
        )
        return response.Response(
            BoardLibraryEntrySerializer(qs, many=True, context={'request': request}).data,
        )

    @decorators.action(detail=True, methods=['post'], url_path='rate')
    def rate(self, request, pk=None):
        board = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        stars = body.get('stars')
        try:
            s = int(stars)
        except (TypeError, ValueError):
            return response.Response({'detail': 'Bewertung: bitte Sterne 1–5 angeben.'}, status=status.HTTP_400_BAD_REQUEST)
        if s not in (1, 2, 3, 4, 5):
            return response.Response({'detail': 'Bewertung: bitte Sterne 1–5 angeben.'}, status=status.HTTP_400_BAD_REQUEST)
        user = resolve_board_owner(request.user)
        BoardRating.objects.update_or_create(board=board, user=user, defaults={'stars': s})
        agg = board.ratings.aggregate(avg_rating=Avg('stars'), rating_count=Count('id'))
        avg = agg['avg_rating']
        return response.Response({
            'stars': s,
            'avg_rating': round(float(avg), 2) if avg is not None else None,
            'rating_count': agg['rating_count'],
        })

    @decorators.action(detail=True, methods=['post'], url_path='adopt-from-library')
    def adopt_from_library(self, request, pk=None):
        original = self.get_object()
        user = resolve_board_owner(request.user)
        clone = Board.objects.create(
            owner=user,
            title=f'{original.title} (übernommen)'[:255],
            description=original.description,
            subject=original.subject,
            grade=original.grade,
            topic=original.topic,
            board_type=original.board_type,
            status=original.status,
            html=original.html,
            css=original.css,
            javascript=original.javascript,
            teacher_notes='',
            usage_instructions=[],
            warnings=list(original.warnings or []),
            used_libraries=list(original.used_libraries or []),
            used_assets=list(original.used_assets or []),
            used_datasets=list(original.used_datasets or []),
            folder=None,
            generation_prompt='',
            generation_input={},
            validation_errors=list(original.validation_errors or []),
            validation_warnings=list(original.validation_warnings or []),
            share_token=None,
            student_link_enabled=False,
            library_public=False,
            library_published_at=None,
            source_board=original,
        )
        return response.Response(
            BoardDetailSerializer(clone, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @decorators.action(detail=True, methods=['post'], url_path='export-zip')
    def export_zip(self, request, pk=None):
        return response.Response(
            {'detail': 'Offline-Export folgt später.'},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )
