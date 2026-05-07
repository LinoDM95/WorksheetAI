"""Hilfen für Board-„Kopf“-Versionierung (Revisionen / KI nur auf aktuellem Stand)."""
from __future__ import annotations

from typing import Any

from django.contrib.auth.models import User
from django.db import transaction

from apps.boards.models import Board, BoardRevision

_META_KEYS_SCALAR = (
    'title',
    'description',
    'teacher_notes',
    'subject',
    'topic',
    'grade',
)
_META_KEYS_LIST = ('usage_instructions', 'warnings', 'used_libraries', 'used_assets', 'used_datasets')


def _duration_from_board(board: Board) -> int | None:
    gi = board.generation_input if isinstance(board.generation_input, dict) else {}
    raw = gi.get('duration_minutes')
    if raw is None:
        return None
    try:
        v = int(raw)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def board_metadata_snapshot(board: Board) -> dict[str, Any]:
    return {
        'title': board.title or '',
        'description': board.description or '',
        'teacher_notes': board.teacher_notes or '',
        'subject': board.subject or '',
        'topic': board.topic or '',
        'grade': board.grade or '',
        'grade_from': board.grade_from,
        'grade_to': board.grade_to,
        'duration_minutes': _duration_from_board(board),
        'usage_instructions': list(board.usage_instructions or []),
        'warnings': list(board.warnings or []),
        'used_libraries': list(board.used_libraries or []),
        'used_assets': list(board.used_assets or []),
        'used_datasets': list(board.used_datasets or []),
    }


def latest_revision(board: Board) -> BoardRevision | None:
    return board.revisions.order_by('-created_at').first()


def board_code_bundle_matches_revision_new(board: Board, rev: BoardRevision) -> bool:
    if (board.html or '') != (rev.new_html or ''):
        return False
    if (board.css or '') != (rev.new_css or ''):
        return False
    if (board.javascript or '') != (rev.new_javascript or ''):
        return False
    return True


def board_matches_revision_metadata(board: Board, nm: dict[str, Any]) -> bool:
    for key in _META_KEYS_SCALAR:
        if key not in nm:
            continue
        if getattr(board, key) != str(nm.get(key) or ''):
            return False
    for key in _META_KEYS_LIST:
        if key not in nm:
            continue
        board_list = list(getattr(board, key) or [])
        nm_list = list(nm.get(key) or [])
        if board_list != nm_list:
            return False
    if 'grade_from' in nm and board.grade_from != nm.get('grade_from'):
        return False
    if 'grade_to' in nm and board.grade_to != nm.get('grade_to'):
        return False
    if 'duration_minutes' in nm:
        bv = _duration_from_board(board)
        nv = nm.get('duration_minutes')
        try:
            nvi = int(nv) if nv is not None else None
            if nvi is not None and nvi <= 0:
                nvi = None
        except (TypeError, ValueError):
            nvi = None
        if bv != nvi:
            return False
    return True


def board_matches_revision_head(board: Board, rev: BoardRevision | None = None) -> bool:
    r = rev if rev is not None else latest_revision(board)
    if r is None:
        return True
    if not board_code_bundle_matches_revision_new(board, r):
        return False
    nm = r.new_metadata if isinstance(r.new_metadata, dict) else {}
    tracked = [
        *_META_KEYS_SCALAR,
        *_META_KEYS_LIST,
        'grade_from',
        'grade_to',
        'duration_minutes',
    ]
    if not any(k in nm for k in tracked):
        return True
    return board_matches_revision_metadata(board, nm)


def require_board_at_revision_head(board: Board) -> None:
    board.refresh_from_db()
    if board_matches_revision_head(board):
        return
    raise ValueError(
        'KI-Nachbearbeitung ist nur auf dem aktuellen Stand (neueste Version) möglich. '
        'Stelle eine Version wieder her oder geh zurück zur Ansicht „Aktueller Stand“.',
    )


def create_initial_revision_if_absent(board: Board, *, user: User | None, prompt: str) -> BoardRevision | None:
    """Legt bei Bedarf eine erste Revision an (Nachgenerierung ohne History)."""
    if board.revisions.exists():
        return None
    board.refresh_from_db()
    meta = board_metadata_snapshot(board)
    return BoardRevision.objects.create(
        board=board,
        prompt=str(prompt or '')[:4000],
        revision_mode='general',
        previous_html='',
        previous_css='',
        previous_javascript='',
        previous_metadata={},
        new_html=board.html or '',
        new_css=board.css or '',
        new_javascript=board.javascript or '',
        new_metadata=meta,
        ai_raw_output={'source': 'initial_snapshot'},
        validation_errors=list(board.validation_errors or []),
        validation_warnings=list(board.validation_warnings or []),
        created_by=user,
    )


def append_manual_code_revision(board: Board, *, user: User | None,
                                previous_bundle: dict[str, Any]) -> BoardRevision:
    board.refresh_from_db()
    nm_new = board_metadata_snapshot(board)
    return BoardRevision.objects.create(
        board=board,
        prompt='(Manuelle Bearbeitung)',
        revision_mode='general',
        previous_html=previous_bundle.get('html') or '',
        previous_css=previous_bundle.get('css') or '',
        previous_javascript=previous_bundle.get('javascript') or '',
        new_html=board.html or '',
        new_css=board.css or '',
        new_javascript=board.javascript or '',
        previous_metadata=dict(previous_bundle.get('metadata') or {}),
        new_metadata=nm_new,
        ai_raw_output={'source': 'manual_patch'},
        validation_errors=list(board.validation_errors or []),
        validation_warnings=list(board.validation_warnings or []),
        created_by=user,
    )


def apply_revision_to_board(
    board: Board,
    *,
    target: BoardRevision,
    user: User | None,
) -> BoardRevision:
    """Übernimmt eine gespeicherte Version als neuen Kopf (neue Revision, Board wird angepasst)."""
    from .free_html_generation import FreeHtmlBoardGenerationService
    from .free_html_sanitize import validate_free_html_bundle

    latest = latest_revision(board)
    if latest is None:
        raise ValueError('Keine Versionshistorie — Wiederherstellen nicht möglich.')

    board.refresh_from_db()
    require_board_at_revision_head(board)

    if target.board_id != board.id:
        raise ValueError('Unbekannte Revision für dieses Board.')

    if latest.id == target.id:
        return latest

    prev_meta = board_metadata_snapshot(board)
    snapshot_prev = {
        'html': board.html or '',
        'css': board.css or '',
        'javascript': board.javascript or '',
        'metadata': prev_meta,
    }

    nm = target.new_metadata if isinstance(target.new_metadata, dict) else {}
    raw = {
        'html': target.new_html or '',
        'css': target.new_css or '',
        'javascript': target.new_javascript or '',
        'teacher_notes': str(nm.get('teacher_notes') or ''),
        'usage_instructions': nm.get('usage_instructions') or [],
        'warnings': nm.get('warnings') or [],
        'used_libraries': nm.get('used_libraries') or [],
        'used_assets': nm.get('used_assets') or [],
        'used_datasets': nm.get('used_datasets') or [],
    }
    bundle = FreeHtmlBoardGenerationService.sanitize_payload(raw)
    ok, errors, warns = validate_free_html_bundle(bundle)
    if not ok:
        raise ValueError(
            'Die gewählte Version enthält blockierte Muster und kann nicht übernommen werden.',
        )

    with transaction.atomic():
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
        title_s = nm.get('title')
        if title_s is not None:
            board.title = str(title_s or '')[:255]
        desc_s = nm.get('description')
        if desc_s is not None:
            board.description = str(desc_s or '')[:5000]
        if 'subject' in nm:
            board.subject = str(nm.get('subject') or '')[:120]
        if 'topic' in nm:
            board.topic = str(nm.get('topic') or '')[:220]
        if 'grade' in nm:
            board.grade = str(nm.get('grade') or '')[:60]
        if 'grade_from' in nm:
            board.grade_from = nm.get('grade_from')
        if 'grade_to' in nm:
            board.grade_to = nm.get('grade_to')
        if 'duration_minutes' in nm:
            gi = dict(board.generation_input) if isinstance(board.generation_input, dict) else {}
            dm = nm.get('duration_minutes')
            if dm is None:
                gi.pop('duration_minutes', None)
            else:
                try:
                    d = int(dm)
                except (TypeError, ValueError):
                    d = None
                if d is not None and 5 <= d <= 90:
                    gi['duration_minutes'] = d
            board.generation_input = gi
        board.status = 'generated' if ok else board.status

        restore_rev = BoardRevision.objects.create(
            board=board,
            prompt=f'(Wiederherstellung vom {target.created_at.strftime("%d.%m.%Y %H:%M")})'[:4000],
            revision_mode='general',
            previous_html=snapshot_prev['html'],
            previous_css=snapshot_prev['css'],
            previous_javascript=snapshot_prev['javascript'],
            new_html=board.html or '',
            new_css=board.css or '',
            new_javascript=board.javascript or '',
            previous_metadata=prev_meta,
            new_metadata=board_metadata_snapshot(board),
            ai_raw_output={'restored_revision_id': str(target.id)},
            validation_errors=list(errors),
            validation_warnings=list(warns),
            created_by=user,
        )
        board.save()

    return restore_rev
