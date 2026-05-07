"""PATCH/PUT-Logik für Board-Detailupdates (Validierung, Bibliothek, Schüler-Link, Revision-Historie)."""
from __future__ import annotations

import secrets
from datetime import timedelta

from django.utils import timezone
from rest_framework import response, status

from apps.boards.models import Board, BoardFolder
from apps.boards.owner import resolve_board_owner
from apps.boards.serializers import BoardDetailSerializer
from apps.boards.services.board_revision_head import append_manual_code_revision, board_metadata_snapshot
from apps.boards.services.free_html_generation import FreeHtmlBoardGenerationService
from apps.boards.services.free_html_sanitize import validate_free_html_bundle
from apps.boards.services.library_public_snapshot import copy_live_bundle_to_library_snapshot
from apps.boards.grade_bounds import resolve_board_grade_fields

_PATCHABLE_TEXT_FIELDS = {'title', 'description'}
_PATCHABLE_CODE_FIELDS = {'html', 'css', 'javascript'}
_PATCHABLE_META_FIELDS = {'teacher_notes', 'usage_instructions', 'warnings'}
_PATCHABLE_CLASSIFICATION_KEYS = frozenset(
    {'subject', 'topic', 'grade', 'grade_from', 'grade_to', 'duration_minutes'},
)
_DURATION_MIN = 5
_DURATION_MAX = 90

_STUDENT_LINK_MAX_VALID_MINUTES = 60 * 24 * 3
_STUDENT_LINK_DEFAULT_VALID_MINUTES = 60 * 24 * 3


def patch_board_with_validation(*, request, instance: Board, _partial: bool):

    body = request.data if isinstance(request.data, dict) else dict(request.data)

    if body.get('library_public') is True and not instance.is_catalog_listed():
        lt_chk = str(
            body.get('library_listing_title', instance.library_listing_title or '') or '',
        ).strip()
        lk_chk = str(
            body.get('library_listing_topic', instance.library_listing_topic or '') or '',
        ).strip()
        ld_chk = str(
            body.get('library_listing_description', instance.library_listing_description or '') or '',
        ).strip()
        if not lt_chk or not lk_chk or not ld_chk:
            return response.Response(
                {
                    'detail': (
                        'Zum Einreichen in die Bibliothek sind ein öffentlicher Titel, '
                        'ein öffentliches Thema und eine öffentliche Beschreibung erforderlich.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    snapshot_before = {
        'html': instance.html or '',
        'css': instance.css or '',
        'javascript': instance.javascript or '',
        'metadata': board_metadata_snapshot(instance),
    }

    text_changes = {k: body[k] for k in _PATCHABLE_TEXT_FIELDS if k in body}
    meta_changes = {k: body[k] for k in _PATCHABLE_META_FIELDS if k in body}
    code_changes = {k: body[k] for k in _PATCHABLE_CODE_FIELDS if k in body}
    classification_touch = bool(_PATCHABLE_CLASSIFICATION_KEYS.intersection(body.keys()))
    folder_id_key = 'folder_id'
    folder_touched = folder_id_key in body

    needs_history = bool(text_changes or meta_changes or code_changes or classification_touch)

    for k, v in text_changes.items():
        setattr(instance, k, str(v or '')[:5000 if k == 'description' else 255])

    if meta_changes:
        if 'teacher_notes' in meta_changes:
            instance.teacher_notes = str(meta_changes['teacher_notes'] or '')[:8000]
        if 'usage_instructions' in meta_changes and isinstance(meta_changes['usage_instructions'], list):
            instance.usage_instructions = [str(x) for x in meta_changes['usage_instructions'] if x][:50]
        if 'warnings' in meta_changes and isinstance(meta_changes['warnings'], list):
            instance.warnings = [str(x) for x in meta_changes['warnings'] if x][:50]

    if classification_touch:
        if 'subject' in body:
            instance.subject = str(body.get('subject') or '')[:120]
        if 'topic' in body:
            instance.topic = str(body.get('topic') or '')[:220]
        if 'duration_minutes' in body:
            raw_dm = body.get('duration_minutes')
            gi = dict(instance.generation_input) if isinstance(instance.generation_input, dict) else {}
            if raw_dm in (None, '', False):
                gi.pop('duration_minutes', None)
            else:
                try:
                    d = int(raw_dm)
                except (TypeError, ValueError):
                    return response.Response(
                        {'detail': 'Geplante Dauer muss eine ganze Zahl sein.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if d < _DURATION_MIN or d > _DURATION_MAX:
                    return response.Response(
                        {
                            'detail': (
                                f'Geplante Dauer muss zwischen {_DURATION_MIN} und {_DURATION_MAX} '
                                'Minuten liegen.'
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                gi['duration_minutes'] = d
            instance.generation_input = gi
        grade_from_in = 'grade_from' in body
        grade_to_in = 'grade_to' in body
        if grade_from_in or grade_to_in:
            if not grade_from_in or not grade_to_in:
                return response.Response(
                    {
                        'detail': (
                            'Klassenstufe „von“ und „bis“ müssen gemeinsam übermittelt werden.'
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                gf = int(body.get('grade_from'))
                gt = int(body.get('grade_to'))
            except (TypeError, ValueError):
                return response.Response(
                    {'detail': 'Klassenstufen müssen ganze Zahlen sein.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not (1 <= gf <= 13 and 1 <= gt <= 13):
                return response.Response(
                    {
                        'detail': 'Klassenstufen müssen zwischen 1 und 13 liegen.',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            lo, hi = min(gf, gt), max(gf, gt)
            instance.grade_from = lo
            instance.grade_to = hi
            instance.grade = f'{lo}–{hi}' if lo != hi else str(lo)
        elif 'grade' in body:
            lo, hi, label = resolve_board_grade_fields({'grade': body.get('grade')})
            instance.grade_from = lo
            instance.grade_to = hi
            instance.grade = label[:60]

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
        if not instance.student_link_enabled:
            instance.student_link_expires_at = None

    if 'student_link_valid_minutes' in body:
        raw_m = body['student_link_valid_minutes']
        if instance.student_link_enabled:
            if raw_m in (None, '', False):
                expires_at = timezone.now() + timedelta(minutes=_STUDENT_LINK_DEFAULT_VALID_MINUTES)
            else:
                try:
                    minutes = int(raw_m)
                except (TypeError, ValueError):
                    minutes = -1
                if minutes <= 0:
                    expires_at = timezone.now() + timedelta(minutes=_STUDENT_LINK_DEFAULT_VALID_MINUTES)
                else:
                    cap = min(minutes, _STUDENT_LINK_MAX_VALID_MINUTES)
                    expires_at = timezone.now() + timedelta(minutes=cap)
            instance.student_link_expires_at = expires_at

    if instance.student_link_enabled and instance.student_link_expires_at is None:
        instance.student_link_expires_at = timezone.now() + timedelta(
            minutes=_STUDENT_LINK_DEFAULT_VALID_MINUTES,
        )

    if 'library_public' in body:
        wants_pub = bool(body['library_public'])
        MOD = Board.LibraryModerationStatus
        is_staff = bool(getattr(request.user, 'is_staff', False))
        catalog_listed = instance.is_catalog_listed()
        is_pending = instance.library_moderation_status == MOD.PENDING

        if wants_pub:
            lt = str(
                body.get('library_listing_title', instance.library_listing_title or '') or '',
            ).strip()
            lk = str(
                body.get('library_listing_topic', instance.library_listing_topic or '') or '',
            ).strip()
            ld = str(
                body.get('library_listing_description', instance.library_listing_description or '') or '',
            ).strip()
            instance.library_listing_title = lt[:255]
            instance.library_listing_topic = lk[:220]
            instance.library_listing_description = ld[:8000]
            if is_staff:
                instance.library_moderation_status = MOD.APPROVED
                instance.library_public = True
                if not catalog_listed:
                    instance.library_published_at = timezone.now()
                copy_live_bundle_to_library_snapshot(instance)
            else:
                instance.library_moderation_status = MOD.PENDING
                instance.library_public = False
                instance.library_published_at = None
        else:
            instance.library_public = False
            instance.library_published_at = None
            if catalog_listed or is_pending or instance.library_moderation_status in (
                MOD.REJECTED,
                MOD.APPROVED,
            ):
                instance.library_moderation_status = MOD.NONE

    listing_editable = instance.is_catalog_listed() or (
        instance.library_moderation_status == Board.LibraryModerationStatus.PENDING
    )
    if listing_editable:
        if 'library_listing_title' in body:
            tv = str(body['library_listing_title'] or '').strip()
            if not tv:
                return response.Response(
                    {'detail': 'Der öffentliche Titel darf nicht geleert werden.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance.library_listing_title = tv[:255]
        if 'library_listing_topic' in body:
            kv = str(body['library_listing_topic'] or '').strip()
            if not kv:
                return response.Response(
                    {'detail': 'Das öffentliche Thema darf nicht geleert werden.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance.library_listing_topic = kv[:220]
        if 'library_listing_description' in body:
            dv = str(body['library_listing_description'] or '').strip()
            if not dv:
                return response.Response(
                    {'detail': 'Die öffentliche Beschreibung darf nicht geleert werden.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            instance.library_listing_description = dv[:8000]

    snapshot_sync_requested = body.get('library_sync_public_snapshot') is True
    if snapshot_sync_requested:
        if not instance.is_catalog_listed():
            return response.Response(
                {
                    'detail': (
                        'Die öffentliche Fassung kann nur aktualisiert werden, wenn das Board '
                        'bereits in der Bibliothek steht.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        is_staff = bool(getattr(request.user, 'is_staff', False))
        if not is_staff:
            return response.Response(
                {
                    'detail': (
                        'Die öffentliche Bibliotheksfassung kann nur von Administrator:innen '
                        'ohne erneute Prüfung überschrieben werden. Reiche deine Änderungen '
                        'über „Zur Freigabe einreichen“ ein.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        copy_live_bundle_to_library_snapshot(instance)

    instance.save()

    if needs_history:
        try:
            owner_user = resolve_board_owner(request.user)
        except ValueError:
            owner_user = None
        append_manual_code_revision(instance, user=owner_user, previous_bundle=snapshot_before)

    return response.Response(BoardDetailSerializer(instance, context={'request': request}).data)
