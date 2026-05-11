from datetime import timedelta

from django.conf import settings
from django.http import StreamingHttpResponse
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from django.utils.html import strip_tags
from rest_framework import decorators, exceptions, permissions, response, status, viewsets
from rest_framework.views import APIView

from apps.ai.error_mapper import AIErrorMapper
from apps.accounts.services.credits import enforce_positive_ai_credits_balance

from .models import Board, BoardFolder, BoardLibraryComment, BoardRating, BoardRevision
from .owner import resolve_board_owner
from .serializers import (
    BoardDetailSerializer,
    BoardFolderSerializer,
    BoardLibraryCommentCreateSerializer,
    BoardLibraryCommentSerializer,
    BoardLibraryEntrySerializer,
    BoardListSerializer,
    BoardRevisionSerializer,
)
from .services.free_html_generation import (
    FreeHtmlBoardGenerationService,
    FreeHtmlBoardRevisionService,
    board_didactic_ai_payload,
    validate_free_html_code,
)
from .services.free_html_block_generation import FreeHtmlBlockBoardGenerationService
from .services.blocks.registry import CATEGORIES, public_block_registry
from .services.blocks.themes import theme_summary
from .services.free_html_sanitize import validate_free_html_bundle
from .services.creative_pipeline import generate_board_stream, generate_with_fallback, use_pipeline_enabled
from .services.board_revision_head import (
    apply_revision_to_board,
    board_metadata_snapshot,
    create_initial_revision_if_absent,
    require_board_at_revision_head,
)
from .services.library_public_snapshot import (
    bundle_for_library_preview,
    copy_live_bundle_to_library_snapshot,
    listing_display_title,
    listing_display_topic,
)
from .services.board_patch import patch_board_with_validation
from .services import student_presence
from .throttles import StudentPresenceScopedThrottle
from .grade_bounds import validate_creative_generate_payload


class PublicBoardPlayView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = ()

    def get(self, request, share_token):
        now = timezone.now()
        board = (
            Board.objects.filter(
                share_token=share_token,
                student_link_enabled=True,
                student_link_expires_at__gt=now,
            )
            .only('title', 'html', 'css', 'javascript', 'used_libraries', 'used_datasets')
            .first()
        )
        if not board:
            return response.Response(
                {'detail': 'Board nicht gefunden, Link nicht aktiv oder Gültigkeit abgelaufen.'},
                status=404,
            )
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


class PublicStudentPresenceView(APIView):
    """Heartbeat von Schüler-Geräten am Token-Link — anonym, nur Zählung."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = ()
    throttle_classes = [StudentPresenceScopedThrottle]

    def post(self, request, share_token):
        now = timezone.now()
        exists = (
            Board.objects.filter(
                share_token=share_token,
                student_link_enabled=True,
                student_link_expires_at__gt=now,
            )
            .only('id')
            .first()
        )
        if not exists:
            return response.Response(
                {'detail': 'Board nicht gefunden, Link nicht aktiv oder Gültigkeit abgelaufen.'},
                status=404,
            )
        body = request.data if isinstance(request.data, dict) else {}
        client_id = body.get('client_id', '')
        action = body.get('action', 'touch')
        if action == 'leave':
            student_presence.leave(share_token, client_id)
        else:
            student_presence.touch(share_token, client_id)
        return response.Response({'ok': True})


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
    """CRUD + KI-Generierung/Revision für Free-HTML5-Boards."""

    def get_object(self):
        if self.action in ('rate', 'adopt_from_library'):
            pk = self.kwargs['pk']
            board = Board.objects.filter(
                pk=pk,
                library_public=True,
                library_moderation_status=Board.LibraryModerationStatus.APPROVED,
            ).first()
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
        return patch_board_with_validation(request=request, instance=instance, _partial=partial)

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

    @decorators.action(detail=True, methods=['get'], url_path='student-presence')
    def student_presence_count(self, request, pk=None):
        board = self.get_object()
        now = timezone.now()
        if not (
            board.share_token
            and board.student_link_enabled
            and board.student_link_expires_at
            and board.student_link_expires_at > now
        ):
            return response.Response({'connected': 0})
        return response.Response({'connected': student_presence.count_connected(board.share_token)})

    @decorators.action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        enforce_positive_ai_credits_balance(request.user)
        body = request.data if isinstance(request.data, dict) else {}
        try:
            validate_creative_generate_payload(body)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        wants_stream = request.query_params.get('stream') in ('1', 'true', 'yes')
        if wants_stream:
            def serialize_board(b: Board) -> dict:
                return BoardDetailSerializer(b, context={'request': request}).data

            def byte_stream():
                import json

                try:
                    for chunk in generate_board_stream(
                        user=request.user,
                        payload=body,
                        serialize_board=serialize_board,
                    ):
                        yield chunk
                except ValueError as exc:
                    line = json.dumps(
                        {'event': 'error', 'detail': str(exc), 'error_code': 'validation'},
                        ensure_ascii=False,
                    ) + '\n'
                    yield line.encode('utf-8')
                except Exception as exc:
                    mapper = AIErrorMapper(exc)
                    _status, code, detail = mapper.parts()
                    prefixed = (
                        f'Board-Generierung fehlgeschlagen: {detail}'
                        if detail else 'Board-Generierung fehlgeschlagen'
                    )
                    line = json.dumps(
                        {'event': 'error', 'detail': prefixed, 'error_code': code},
                        ensure_ascii=False,
                    ) + '\n'
                    yield line.encode('utf-8')

            resp = StreamingHttpResponse(byte_stream(), content_type='application/x-ndjson; charset=utf-8')
            resp.status_code = status.HTTP_201_CREATED
            resp['Cache-Control'] = 'no-store'
            resp['X-Accel-Buffering'] = 'no'
            return resp
        try:
            board = generate_with_fallback(request.user, body)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='Board-Generierung fehlgeschlagen')
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
        """Bausteinmodus: erzeugt ein Board deterministisch aus einer CompositionSpec."""
        enforce_positive_ai_credits_balance(request.user)
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
        enforce_positive_ai_credits_balance(request.user)
        board = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        prompt = body.get('prompt') or ''
        tier = body.get('ai_quality_tier')
        revision_mode = body.get('revision_mode') if isinstance(body.get('revision_mode'), str) else 'general'
        try:
            revision = FreeHtmlBoardRevisionService(
                board,
                prompt,
                request.user,
                ai_quality_tier=tier if isinstance(tier, str) else None,
                revision_mode=revision_mode,
            ).run()
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='Board-Revision fehlgeschlagen')
        board.refresh_from_db()
        return response.Response(
            {
                'board': BoardDetailSerializer(board, context={'request': request}).data,
                'revision': BoardRevisionSerializer(revision).data,
            }
        )

    @decorators.action(detail=True, methods=['post'], url_path='run-quality-check')
    def run_quality_check(self, request, pk=None):
        """Führt Validation + (Visual-QA) + TouchAudit + ScreenshotJudge erneut aus.

        Aktualisiert nur die Report-Felder, **nicht** den Code.
        """
        from .services.touch_audit import TouchAuditService
        from .services.screenshot_quality_judge import ScreenshotQualityJudge
        from .services.ai_model_router import SmartboardAIModelRouter
        from .services.free_html_visual_qa import (
            run_visual_layout_qa,
            visual_qa_playwright_available,
            default_visual_qa_document_base,
        )
        from .services.quality_report import build_quality_report

        enforce_positive_ai_credits_balance(request.user)
        board = self.get_object()
        bundle = {
            'html': board.html or '',
            'css': board.css or '',
            'javascript': board.javascript or '',
            'used_libraries': list(board.used_libraries or []),
            'used_assets': list(board.used_assets or []),
            'used_datasets': list(board.used_datasets or []),
        }
        ok, errors, warnings = validate_free_html_bundle(bundle)
        visual_errs: list[str] = []
        browser_test = {'ran': False, 'errors': [], 'warnings': []}
        if visual_qa_playwright_available() and getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True):
            href = default_visual_qa_document_base()
            if href:
                try:
                    visual_errs, _ = run_visual_layout_qa(bundle, document_base_href=href)
                    browser_test = {'ran': True, 'errors': visual_errs, 'warnings': []}
                except Exception as exc:
                    browser_test = {'ran': False, 'errors': [str(exc)[:300]], 'warnings': []}

        touch_result: dict = {}
        try:
            touch_result = TouchAuditService(style_dna=board.style_dna or {}).run(bundle)
        except Exception:
            touch_result = {'ran': False, 'reason': 'touch audit failed'}

        screen_result: dict = {}
        try:
            router = SmartboardAIModelRouter(user=request.user, board=board)
            screen_result = ScreenshotQualityJudge(
                router=router, style_dna=board.style_dna or {},
                board_meta={'subject': board.subject, 'grade': board.grade, 'topic': board.topic},
            ).run(bundle, board_id=str(board.id))
        except Exception:
            screen_result = {'ran': False, 'reason': 'screenshot judge failed'}

        report = build_quality_report(
            validation_errors=list(errors) + [f'[Visuell] {e}' for e in visual_errs],
            validation_warnings=list(warnings),
            browser_test_result=browser_test,
            touch_audit_result=touch_result,
            screenshot_quality_result=screen_result,
            repair_history=board.repair_history or [],
            risk_analysis=board.risk_analysis or {},
            style_dna=board.style_dna or {},
        )
        board.validation_errors = list(errors)
        board.validation_warnings = list(warnings)
        board.browser_test_result = browser_test
        board.touch_audit_result = touch_result
        board.screenshot_quality_result = screen_result
        board.quality_report = report
        board.save(update_fields=[
            'validation_errors', 'validation_warnings',
            'browser_test_result', 'touch_audit_result', 'screenshot_quality_result',
            'quality_report', 'updated_at',
        ])
        return response.Response(BoardDetailSerializer(board, context={'request': request}).data)

    @decorators.action(detail=True, methods=['post'], url_path='auto-repair')
    def auto_repair(self, request, pk=None):
        """Führt RepairAgent auf Basis aktueller Reports aus und legt eine Revision an."""
        from .services.repair_agent import RepairAgent, MODE_TO_PROMPT_KEY
        from .services.free_html_generation import _select_provider

        board = self.get_object()
        try:
            require_board_at_revision_head(board)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        body = request.data if isinstance(request.data, dict) else {}
        mode = body.get('revision_mode') or body.get('mode') or 'general_repair'
        if mode not in MODE_TO_PROMPT_KEY:
            mode = 'general_repair'

        prev_meta = board_metadata_snapshot(board)
        prev_html, prev_css, prev_js = board.html or '', board.css or '', board.javascript or ''
        quality_report_before = dict(board.quality_report or {})

        bundle = {
            'html': board.html or '',
            'css': board.css or '',
            'javascript': board.javascript or '',
            'teacher_notes': board.teacher_notes or '',
            'usage_instructions': list(board.usage_instructions or []),
            'warnings': list(board.warnings or []),
            'used_libraries': list(board.used_libraries or []),
            'used_assets': list(board.used_assets or []),
            'used_datasets': list(board.used_datasets or []),
        }
        provider = _select_provider(ai_quality_tier=None)
        enforce_positive_ai_credits_balance(request.user)
        from .services.pipeline_ai_meter import generation_meter_context

        hint_max = max(2_000, int(getattr(settings, 'AI_BOARD_REPAIR_CONTEXT_HINT_MAX_CHARS', 12_000)))
        didactic = board_didactic_ai_payload(board)
        try:
            agent = RepairAgent(
                provider=provider,
                style_dna=board.style_dna or {},
                creative_brief=board.creative_brief or {},
                risk_analysis=board.risk_analysis or {},
                board_didactic=didactic,
                context_hint=str(body.get('hint') or '')[:hint_max],
                run_visual_qa=getattr(settings, 'BOARDS_VISUAL_QA_ALLOWED', True),
                run_touch_audit=getattr(settings, 'SMARTBOARD_ENABLE_TOUCH_AUDIT', True),
            )
            with generation_meter_context(user=request.user) as meter:
                try:
                    result = agent.run(
                        bundle, mode=mode,
                        touch_audit_result=board.touch_audit_result or {},
                        screenshot_quality_result=board.screenshot_quality_result or {},
                        board_id=str(board.id),
                    )
                finally:
                    meter.flush_logs_to_board(board)
        except Exception as exc:
            return AIErrorMapper.to_response(exc, detail_prefix='Auto-Reparatur fehlgeschlagen')

        new_bundle = result.get('bundle') or {}
        rev_mode = body.get('revision_mode') if body.get(
            'revision_mode',
        ) in dict(BoardRevision._meta.get_field('revision_mode').choices) else 'general'

        rev_user = resolve_board_owner(request.user)

        if new_bundle and result.get('ok'):
            merged = {
                'html': new_bundle.get('html', board.html or ''),
                'css': new_bundle.get('css', board.css or ''),
                'javascript': new_bundle.get('javascript', board.javascript or ''),
                'teacher_notes': new_bundle.get('teacher_notes', board.teacher_notes or ''),
                'usage_instructions': new_bundle.get('usage_instructions', board.usage_instructions or []),
                'warnings': new_bundle.get('warnings', board.warnings or []),
                'used_libraries': new_bundle.get('used_libraries', board.used_libraries or []),
                'used_assets': new_bundle.get('used_assets', board.used_assets or []),
                'used_datasets': new_bundle.get('used_datasets', board.used_datasets or []),
            }
            sanitized = FreeHtmlBoardGenerationService.sanitize_payload(merged)
            _ok, errors, warns = validate_free_html_bundle(sanitized)
            board.html = sanitized['html']
            board.css = sanitized['css']
            board.javascript = sanitized['javascript']
            board.teacher_notes = sanitized['teacher_notes']
            board.usage_instructions = sanitized['usage_instructions']
            board.warnings = sanitized['warnings']
            board.used_libraries = sanitized['used_libraries']
            board.used_assets = sanitized['used_assets']
            board.used_datasets = sanitized['used_datasets']
            board.validation_errors = list(errors)
            board.validation_warnings = list(warns)
            board.touch_audit_result = result.get('touch_audit') or board.touch_audit_result
            board.repair_history = list(board.repair_history or []) + list(result.get('history') or [])
            board.save(
                update_fields=[
                    'html', 'css', 'javascript', 'teacher_notes', 'usage_instructions', 'warnings',
                    'used_libraries', 'used_assets', 'used_datasets',
                    'validation_errors', 'validation_warnings',
                    'touch_audit_result', 'repair_history', 'updated_at',
                ],
            )
            nm = board_metadata_snapshot(board)
            nm['auto_repair_mode'] = mode
            nm['rounds'] = result.get('rounds')
            revision = BoardRevision.objects.create(
                board=board,
                prompt=str(body.get('hint') or '')[:4000],
                revision_mode=rev_mode,
                previous_html=prev_html,
                previous_css=prev_css,
                previous_javascript=prev_js,
                new_html=board.html or '',
                new_css=board.css or '',
                new_javascript=board.javascript or '',
                previous_metadata=prev_meta,
                new_metadata=nm,
                ai_raw_output={'mode': mode, 'rounds': result.get('rounds')},
                validation_errors=list(errors),
                validation_warnings=list(warns),
                quality_report_before=quality_report_before,
                repair_notes=list(result.get('history') or []),
                created_by=rev_user,
            )
        else:
            revision = BoardRevision.objects.create(
                board=board,
                prompt=str(body.get('hint') or '')[:4000],
                revision_mode=rev_mode,
                previous_html=prev_html,
                previous_css=prev_css,
                previous_javascript=prev_js,
                new_html=board.html or '',
                new_css=board.css or '',
                new_javascript=board.javascript or '',
                previous_metadata=prev_meta,
                new_metadata={**board_metadata_snapshot(board), 'auto_repair': 'no_board_update', 'mode': mode},
                ai_raw_output={'mode': mode, 'rounds': result.get('rounds')},
                validation_errors=list(result.get('errors') or []),
                validation_warnings=list(result.get('warnings') or []),
                quality_report_before=quality_report_before,
                repair_notes=list(result.get('history') or []),
                created_by=rev_user,
            )
        return response.Response({
            'board': BoardDetailSerializer(board, context={'request': request}).data,
            'revision': BoardRevisionSerializer(revision).data,
            'ok': bool(result.get('ok')),
        })

    @decorators.action(detail=True, methods=['get'], url_path='quality-report')
    def quality_report_action(self, request, pk=None):
        board = self.get_object()
        return response.Response(board.quality_report or {})

    @decorators.action(detail=False, methods=['get'], url_path='pipeline-status')
    def pipeline_status(self, request):
        """Frontend-Status: ist die Pipeline aktiv? Welche Audits sind möglich?"""
        from .services.free_html_visual_qa import visual_qa_playwright_available, default_visual_qa_document_base
        return response.Response({
            'use_pipeline': use_pipeline_enabled(),
            'small_model': str(getattr(settings, 'SMARTBOARD_SMALL_MODEL', '')),
            'large_model': str(getattr(settings, 'SMARTBOARD_LARGE_MODEL', '')),
            'default_quality_mode': str(getattr(settings, 'SMARTBOARD_DEFAULT_QUALITY_MODE', 'balanced')),
            'screenshot_judge_enabled': bool(getattr(settings, 'SMARTBOARD_ENABLE_SCREENSHOT_JUDGE', True)),
            'touch_audit_enabled': bool(getattr(settings, 'SMARTBOARD_ENABLE_TOUCH_AUDIT', True)),
            'browser_smoke_test_enabled': bool(getattr(settings, 'SMARTBOARD_ENABLE_BROWSER_SMOKE_TEST', True)),
            'creative_brief_enabled': bool(getattr(settings, 'SMARTBOARD_ENABLE_CREATIVE_BRIEF', True)),
            'style_dna_enabled': bool(getattr(settings, 'SMARTBOARD_ENABLE_STYLE_DNA', True)),
            'vision_judge_enabled': bool(getattr(settings, 'SMARTBOARD_ENABLE_VISION_JUDGE', False)),
            'playwright_available': visual_qa_playwright_available(),
            'visual_qa_document_base_configured': bool(default_visual_qa_document_base()),
        })

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
            grade_from=original.grade_from,
            grade_to=original.grade_to,
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
        create_initial_revision_if_absent(
            clone, user=resolve_board_owner(request.user), prompt='(Kopie)',
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

    @decorators.action(detail=True, methods=['post'], url_path='apply-revision')
    def apply_revision(self, request, pk=None):
        board = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        rid = body.get('revision_id')
        if not rid:
            return response.Response(
                {'detail': 'Parameter revision_id fehlt.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = board.revisions.filter(pk=rid).first()
        if not target:
            return response.Response(
                {'detail': 'Revision nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            rev_user = resolve_board_owner(request.user)
        except ValueError:
            rev_user = None
        try:
            apply_revision_to_board(board, target=target, user=rev_user)
        except ValueError as exc:
            return response.Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        board.refresh_from_db()
        return response.Response(BoardDetailSerializer(board, context={'request': request}).data)

    @decorators.action(detail=True, methods=['post'], url_path='delete-revision')
    def delete_revision(self, request, pk=None):
        board = self.get_object()
        body = request.data if isinstance(request.data, dict) else {}
        rid = body.get('revision_id')
        if not rid:
            return response.Response(
                {'detail': 'Parameter revision_id fehlt.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = board.revisions.filter(pk=rid).first()
        if not target:
            return response.Response(
                {'detail': 'Revision nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        latest = board.revisions.order_by('-created_at').first()
        if latest is not None and latest.id == target.id:
            return response.Response(
                {'detail': 'Die aktuelle Version kann nicht gelöscht werden.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target.delete()
        board.refresh_from_db()
        return response.Response(BoardDetailSerializer(board, context={'request': request}).data)

    @decorators.action(detail=False, methods=['get'], url_path='library')
    def library_list(self, request):
        try:
            user = resolve_board_owner(request.user)
        except ValueError:
            return response.Response([])
        qs = (
            Board.objects.filter(
                library_public=True,
                library_moderation_status=Board.LibraryModerationStatus.APPROVED,
            )
            .select_related('owner')
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
            BoardLibraryEntrySerializer(qs, many=True, context={'request': request}).data,
        )

    @decorators.action(detail=True, methods=['get'], url_path='library-entry')
    def library_entry(self, request, pk=None):
        """Einzelner öffentlicher Bibliotheks-Eintrag (Deep-Link zur Community-Vorschau)."""
        try:
            resolve_board_owner(request.user)
        except ValueError:
            return response.Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = (
            Board.objects.filter(
                pk=pk,
                library_public=True,
                library_moderation_status=Board.LibraryModerationStatus.APPROVED,
            )
            .select_related('owner')
            .annotate(
                avg_rating=Avg('ratings__stars'),
                rating_count=Count('ratings', distinct=True),
                comment_count=Count('library_comments', distinct=True),
            )
        )
        board = qs.first()
        if not board:
            raise exceptions.NotFound()
        return response.Response(
            BoardLibraryEntrySerializer(board, context={'request': request}).data,
        )

    @decorators.action(detail=True, methods=['get', 'post'], url_path='library-comments')
    def library_comments(self, request, pk=None):
        board = Board.objects.filter(
            pk=pk,
            library_public=True,
            library_moderation_status=Board.LibraryModerationStatus.APPROVED,
        ).first()
        if not board:
            raise exceptions.NotFound()

        if request.method == 'GET':
            rows = board.library_comments.order_by('-created_at')[:200]
            return response.Response(BoardLibraryCommentSerializer(rows, many=True).data)

        try:
            user = resolve_board_owner(request.user)
        except ValueError:
            return response.Response(
                {'detail': 'Authentifizierung erforderlich.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ser = BoardLibraryCommentCreateSerializer(data=request.data)
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
        recent_n = BoardLibraryComment.objects.filter(
            board=board, user=user, created_at__gte=hour_ago
        ).count()
        if recent_n >= 24:
            return response.Response(
                {'detail': 'Zu viele Kommentare in kurzer Zeit. Bitte später erneut versuchen.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        c = BoardLibraryComment.objects.create(board=board, user=user, body=text)
        return response.Response(
            BoardLibraryCommentSerializer(c).data,
            status=status.HTTP_201_CREATED,
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
        lib_html, lib_css, lib_js, lib_ul, lib_ud = bundle_for_library_preview(original)
        clone = Board.objects.create(
            owner=user,
            title=f'{listing_display_title(original)} (übernommen)'[:255],
            description='',
            subject=original.subject,
            grade=original.grade,
            grade_from=original.grade_from,
            grade_to=original.grade_to,
            topic=listing_display_topic(original),
            board_type=original.board_type,
            status=original.status,
            html=lib_html,
            css=lib_css,
            javascript=lib_js,
            teacher_notes='',
            usage_instructions=[],
            warnings=list(original.warnings or []),
            used_libraries=list(lib_ul),
            used_assets=list(original.used_assets or []),
            used_datasets=list(lib_ud),
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
        create_initial_revision_if_absent(
            clone, user=user, prompt='(Aus Bibliothek übernommen)',
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
